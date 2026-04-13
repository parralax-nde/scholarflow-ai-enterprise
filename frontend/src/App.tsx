import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Legend, Tooltip } from 'chart.js'
import { CheckCircle, Menu, XCircle } from 'lucide-react'

ChartJS.register(BarElement, CategoryScale, LinearScale, Legend, Tooltip)

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const chartData = useMemo(
    () => ({
      labels: ['ML', 'NLP', 'Vision'],
      datasets: [
        { label: 'Citation Impact', data: [42, 36, 22], backgroundColor: '#2563eb' },
        { label: 'Plagiarism Risk', data: [18, 28, 9], backgroundColor: '#ef4444' },
      ],
    }),
    [],
  )

  return (
    <div className="app-shell">
      <header className="topbar">
        <button aria-label="Menu" className="menu-btn" onClick={() => setMenuOpen((v) => !v)}>
          <Menu size={20} />
        </button>
        <h1>ScholarFlow AI Enterprise</h1>
      </header>

      <div className="layout-grid">
        <motion.aside
          initial={false}
          animate={{ x: menuOpen ? 0 : -260 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="sidebar"
        >
          <nav>
            <a href="#">Workspace</a>
            <a href="#">Citations</a>
            <a href="#">Plagiarism</a>
            <a href="#">Admin</a>
          </nav>
        </motion.aside>

        <main className="workspace">
          <section className="editor-pane">
            <h2>Research Workspace</h2>
            <div className="skeleton">Loading editor…</div>
            <textarea defaultValue="Draft your proposal here..." />
          </section>

          <section className="insight-pane">
            <h3>AI Suggestions & Status</h3>
            <div className="status-row">
              <CheckCircle size={18} /> Similarity scan healthy
            </div>
            <div className="status-row warning">
              <XCircle size={18} /> 1 sentence flagged above 0.8
            </div>
          </section>
        </main>

        <section className="chart-pane">
          <h3>Impact Metrics</h3>
          <Bar data={chartData} options={{ responsive: true, maintainAspectRatio: false }} />
        </section>
      </div>

      <nav className="bottom-nav">
        <button>Workspace</button>
        <button>Citations</button>
        <button>Admin</button>
      </nav>
    </div>
  )
}
