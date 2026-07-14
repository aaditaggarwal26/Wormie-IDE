import { motion } from 'framer-motion'
import { BrainCircuit, LockKeyhole } from 'lucide-react'

export function TutorPane(): React.JSX.Element {
  return (
    <aside className="tutor-pane">
      <div className="tutor-heading">
        <div>
          <span className="eyebrow">AI Tutor</span>
          <h2>Learning gate</h2>
        </div>
        <div className="tutor-status"><span /> Idle</div>
      </div>

      <motion.div
        animate={{ opacity: 1 }}
        className="gate-card"
        initial={{ opacity: 0 }}
        transition={{ delay: 0.12 }}
      >
        <div className="gate-icon"><BrainCircuit size={20} /></div>
        <p className="gate-label">No active request</p>
        <h3>Code stays locked until the idea clicks.</h3>
        <p className="gate-copy">Ask for a change, learn the underlying concepts, and prove your understanding before generation begins.</p>
      </motion.div>

      <div className="learning-path">
        <div className="path-step">
          <div className="step-marker">1</div>
          <div><span>Step 1</span><strong>Concept map</strong></div>
        </div>
        <div className="path-line" />
        <div className="path-step">
          <div className="step-marker">2</div>
          <div><span>Step 2</span><strong>Focused lesson</strong></div>
        </div>
        <div className="path-line" />
        <div className="path-step">
          <div className="step-marker">3</div>
          <div><span>Step 3</span><strong>Adaptive quiz</strong></div>
        </div>
      </div>

      <div className="unlock-bar">
        <LockKeyhole size={14} />
        <span>Generation locked</span>
      </div>
    </aside>
  )
}
