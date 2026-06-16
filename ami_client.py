"""Yengil asyncio asosidagi Asterisk AMI (Manager Interface) klienti.

Tashqi kutubxonasiz: AMI ustidan ulanadi, login qiladi, hodisalarni o'qiydi,
qurilma (operator) holatlari va navbatni xotirada saqlaydi, hamda hodisalarni
callback orqali uzatadi. Avtomatik qayta ulanish bilan.
"""
import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable

from .config import settings

logger = logging.getLogger("ami")

EventCallback = Callable[[dict], Awaitable[None]]

# Asterisk qurilma holatini dashboard holatiga moslash
DEVICE_STATE_MAP = {
    "NOT_INUSE": "idle",
    "INUSE": "talk",
    "BUSY": "talk",
    "RINGING": "ringing",
    "RINGINUSE": "talk",
    "ONHOLD": "hold",
    "UNAVAILABLE": "off",
    "INVALID": "off",
    "UNKNOWN": "off",
}


class AMIClient:
    def __init__(self, on_event: EventCallback):
        self._on_event = on_event
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None
        self._running = False
        self._actionid = 0
        # Xotiradagi jonli holat
        self.channels: dict[str, dict] = {}          # kanal -> ma'lumot
        self.devices: dict[str, str] = {}            # "PJSIP/900" -> "talk"/"idle"/...
        self.queues: dict[str, int] = {}             # navbat nomi -> kutayotganlar soni
        self.connected = False

    async def connect(self) -> None:
        self._running = True
        while self._running:
            try:
                self._reader, self._writer = await asyncio.open_connection(
                    settings.ami_host, settings.ami_port
                )
                await self._reader.readline()  # banner
                await self._login()
                self.connected = True
                logger.info("AMI ulandi: %s:%s", settings.ami_host, settings.ami_port)
                # Boshlang'ich holatni so'rab olamiz
                await self._send({"Action": "DeviceStateList"})
                await self._send({"Action": "QueueStatus"})
                await self._read_loop()
            except (OSError, asyncio.IncompleteReadError) as exc:
                self.connected = False
                logger.warning("AMI uzildi (%s). 5s dan keyin qayta urinish.", exc)
                await asyncio.sleep(5)

    async def _login(self) -> None:
        await self._send({
            "Action": "Login",
            "Username": settings.ami_username,
            "Secret": settings.ami_secret,
        })

    async def _send(self, fields: dict) -> None:
        if not self._writer:
            return
        self._actionid += 1
        fields.setdefault("ActionID", str(self._actionid))
        data = "".join(f"{k}: {v}\r\n" for k, v in fields.items()) + "\r\n"
        self._writer.write(data.encode())
        await self._writer.drain()

    async def originate(self, channel: str, exten: str, context: str = "from-internal") -> str:
        """Klik-to-koll: tashqi tizim so'rovi bilan qo'ng'iroq boshlash."""
        action_id = uuid.uuid4().hex
        await self._send({
            "Action": "Originate", "Channel": channel, "Exten": exten,
            "Context": context, "Priority": "1", "CallerID": exten, "Async": "true",
            "ActionID": action_id,
        })
        return action_id

    async def _read_loop(self) -> None:
        block: dict = {}
        assert self._reader is not None
        while self._running:
            line = await self._reader.readline()
            if not line:
                raise asyncio.IncompleteReadError(b"", None)
            text = line.decode(errors="ignore").rstrip("\r\n")
            if text == "":
                if block:
                    await self._handle(block)
                    block = {}
                continue
            if ": " in text:
                key, value = text.split(": ", 1)
                block[key] = value

    def _device_ext(self, device: str) -> str:
        """'PJSIP/900' yoki 'SIP/900' -> '900'."""
        return device.split("/")[-1] if "/" in device else device

    async def _handle(self, block: dict) -> None:
        event = block.get("Event")
        if not event:
            return

        if event in ("Newchannel", "Newstate"):
            ch = block.get("Channel", "")
            self.channels[ch] = {
                "channel": ch,
                "state": block.get("ChannelStateDesc", ""),
                "caller": block.get("CallerIDNum", ""),
                "exten": block.get("Exten", ""),
                "uniqueid": block.get("Uniqueid", ""),
            }
        elif event == "Hangup":
            self.channels.pop(block.get("Channel", ""), None)

        elif event in ("DeviceStateChange", "DeviceStateListComplete", "DeviceStateList"):
            device = block.get("Device", "")
            state = block.get("State", "")
            if device:
                self.devices[device] = DEVICE_STATE_MAP.get(state, "off")

        elif event in ("QueueMember", "QueueMemberStatus"):
            # a'zo holati ham qurilma holatini aniqlashtiradi
            loc = block.get("Location") or block.get("StateInterface", "")
            paused = block.get("Paused") == "1"
            if loc:
                self.devices.setdefault(loc, "idle")
                if paused:
                    self.devices[loc] = "pause"

        elif event == "QueueParams":
            self.queues[block.get("Queue", "")] = int(block.get("Calls", 0))
        elif event == "QueueCallerJoin":
            q = block.get("Queue", "")
            self.queues[q] = int(block.get("Count", self.queues.get(q, 0) + 1))
        elif event == "QueueCallerLeave":
            q = block.get("Queue", "")
            self.queues[q] = max(0, int(block.get("Count", self.queues.get(q, 1) - 1)))

        await self._on_event(block)

    def operators(self) -> list[dict]:
        """Jonli operatorlar ro'yxati (ext + holat)."""
        return [
            {"extension": self._device_ext(dev), "device": dev, "state": st}
            for dev, st in sorted(self.devices.items())
        ]

    def queue_waiting(self) -> int:
        return sum(self.queues.values())

    def snapshot(self) -> dict:
        """Live Dashboard uchun joriy holat."""
        return {
            "connected": self.connected,
            "active_calls": len(self.channels),
            "queue_waiting": self.queue_waiting(),
            "channels": list(self.channels.values()),
            "operators": self.operators(),
        }

    async def stop(self) -> None:
        self._running = False
        if self._writer:
            self._writer.close()
