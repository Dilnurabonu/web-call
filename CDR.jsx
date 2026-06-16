import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import { fmtDate, fmtDur, Tag } from "../components/ui";

const PAGE_SIZE = 25;

export default function CDR() {
  const [filters, setFilters] = useState({ date_from: "", date_to: "", src: "", disposition: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [stats, setStats] = useState({ total: 0, answered: 0, no_answer: 0, total_talk_minutes: 0 });
  const [hourly, setHourly] = useState([]);
  const [playing, setPlaying] = useState(null);
  const [error, setError] = useState("");

  const query = useCallback(
    (extra = {}) => {
      const p = new URLSearchParams();
      Object.entries({ ...filters, ...extra }).forEach(([k, v]) => v && p.append(k, v));
      return p.toString();
    },
    [filters]
  );

  const loadList = useCallback(async () => {
    try {
      const d = await api.get(`/api/cdr?${query({ page, page_size: PAGE_SIZE })}`);
      setData(d);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [query, page]);

  const loadAnalytics = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([
        api.get(`/api/cdr/stats?${query()}`),
        api.get(`/api/cdr/hourly?${query()}`),
      ]);
      setStats(s);
      setHourly(h.labels.map((hour, i) => ({ hour: `${hour}:00`, calls: h.values[i] })));
    } catch {
      /* statistika ixtiyoriy */
    }
  }, [query]);

  useEffect(() => {
    loadList();
  }, [loadList]);
  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const pages = useMemo(() => Math.max(1, Math.ceil(data.total / PAGE_SIZE)), [data.total]);
  const apply = () => {
    setPage(1);
    loadList();
    loadAnalytics();
  };

  const exportReport = (fmt) =>
    api.downloadBlob(`/api/cdr/export?${query({ fmt })}`, `cdr_report.${fmt}`).catch((e) => setError(e.message));

  return (
    <section>
      <div className="page-head">
        <h2>Qo'ng'iroqlar statistikasi</h2>
      </div>

      <div className="tiles">
        <div className="tile">
          <div className="k">Jami</div>
          <div className="v mono">{stats.total}</div>
        </div>
        <div className="tile live">
          <div className="k">Javob berilgan</div>
          <div className="v mono">{stats.answered}</div>
        </div>
        <div className="tile drop">
          <div className="k">O'tkazib yuborilgan</div>
          <div className="v mono">{stats.no_answer}</div>
        </div>
        <div className="tile">
          <div className="k">Suhbat (daqiqa)</div>
          <div className="v mono">{stats.total_talk_minutes}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3>Soatlar bo'yicha yuklanish</h3>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourly}>
              <CartesianGrid stroke="#1e2c44" vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: "#7e8ca6", fontSize: 9 }} />
              <YAxis tick={{ fill: "#7e8ca6", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#111a2b", border: "1px solid #1e2c44", borderRadius: 8 }}
                labelStyle={{ color: "#e6edf7" }}
              />
              <Bar dataKey="calls" fill="#2dd4a7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="filters">
          <div className="grp">
            <label>Sanadan</label>
            <input
              type="date"
              className="field"
              value={filters.date_from}
              onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
            />
          </div>
          <div className="grp">
            <label>Sanagacha</label>
            <input
              type="date"
              className="field"
              value={filters.date_to}
              onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
            />
          </div>
          <div className="grp">
            <label>Operator</label>
            <input
              className="field"
              placeholder="900"
              value={filters.src}
              onChange={(e) => setFilters({ ...filters, src: e.target.value })}
            />
          </div>
          <div className="grp">
            <label>Holati</label>
            <select
              className="field"
              value={filters.disposition}
              onChange={(e) => setFilters({ ...filters, disposition: e.target.value })}
            >
              <option value="">Hammasi</option>
              <option>ANSWERED</option>
              <option>NO ANSWER</option>
              <option>BUSY</option>
              <option>FAILED</option>
            </select>
          </div>
          <button className="pill" onClick={apply}>
            Qidirish
          </button>
          <button className="ghost" onClick={() => exportReport("xlsx")}>
            ⤓ Excel
          </button>
          <button className="ghost" onClick={() => exportReport("pdf")}>
            ⤓ PDF
          </button>
        </div>

        {error && <div className="err" style={{ marginBottom: 10 }}>{error}</div>}

        <table>
          <thead>
            <tr>
              <th>Sana</th>
              <th>Kimdan</th>
              <th>Kimga</th>
              <th>Holati</th>
              <th>Davomiyligi</th>
              <th>Yozuv</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((c) => (
              <tr key={c.uniqueid}>
                <td className="mono">{fmtDate(c.calldate)}</td>
                <td className="mono">{c.src}</td>
                <td className="mono">{c.dst}</td>
                <td>
                  <Tag value={c.disposition} />
                </td>
                <td className="mono">{fmtDur(c.billsec)}</td>
                <td>
                  {playing === c.uniqueid ? (
                    <audio
                      src={api.authedUrl(`/api/recordings/${encodeURIComponent(c.recordingfile)}/stream`)}
                      controls
                      autoPlay
                    />
                  ) : c.recordingfile ? (
                    <button className="ghost sm" onClick={() => setPlaying(c.uniqueid)}>
                      ▶ Tinglash
                    </button>
                  ) : (
                    <span style={{ color: "var(--dim)" }}>–</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="pager">
          <span>Jami: {data.total} ta yozuv</span>
          <span>
            <button className="ghost sm" onClick={() => setPage((p) => Math.max(1, p - 1))}>
              ‹
            </button>{" "}
            {page} / {pages}{" "}
            <button className="ghost sm" onClick={() => setPage((p) => Math.min(pages, p + 1))}>
              ›
            </button>
          </span>
        </div>
      </div>
    </section>
  );
}
