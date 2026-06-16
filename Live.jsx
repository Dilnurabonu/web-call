import { useLiveSocket } from "../hooks/useLiveSocket";
import { stateLabel } from "../components/ui";

export default function Live() {
  const { snapshot, events } = useLiveSocket();
  const operators = snapshot.operators || [];
  const idleCount = operators.filter((o) => o.state === "idle").length;

  return (
    <section>
      <div className="page-head">
        <h2>Jonli monitoring</h2>
        <div className={`conn ${snapshot.connected ? "" : "off"}`}>
          <span className="pulse" />
          {snapshot.connected ? "AMI ulangan" : "AMI uzilgan"}
        </div>
      </div>

      <div className="tiles">
        <div className="tile live">
          <div className="k">Faol qo'ng'iroqlar</div>
          <div className="v mono">{snapshot.active_calls}</div>
        </div>
        <div className="tile wait">
          <div className="k">Navbatda</div>
          <div className="v mono">
            {snapshot.queue_waiting}
            <small>mijoz</small>
          </div>
        </div>
        <div className="tile">
          <div className="k">Operatorlar</div>
          <div className="v mono">{operators.length}</div>
        </div>
        <div className="tile">
          <div className="k">Bo'sh operator</div>
          <div className="v mono">{idleCount}</div>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h3>Operatorlar holati</h3>
          {operators.length === 0 && <div className="empty">Operatorlar ma'lumoti kutilmoqda…</div>}
          {operators.map((o) => (
            <div className="op" key={o.device}>
              <span className={`st ${o.state}`} />
              <span className="mono">{o.extension}</span>
              <span className="ext mono">{o.device}</span>
              <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 12 }}>
                {stateLabel(o.state)}
              </span>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>AMI hodisalar oqimi</h3>
          <div className="ticker">
            {events.length === 0 && <div style={{ color: "var(--dim)" }}>Hodisalar kutilmoqda…</div>}
            {events.map((e, i) => (
              <div className="row" key={i}>
                {e.t} <span className="ev">{e.ev}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
