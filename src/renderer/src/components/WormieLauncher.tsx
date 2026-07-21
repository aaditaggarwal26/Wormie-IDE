import { motion } from 'framer-motion'
import { ArrowRight, Code2, GraduationCap, LogOut } from 'lucide-react'
import type { CloudUser, WorkspaceSnapshot } from '@shared/contracts'

type WormieLauncherProps = {
  user: CloudUser
  workspace: WorkspaceSnapshot | null
  teachingCount: number
  enrolledCount: number
  onOpenSandbox: () => void
  onOpenClassrooms: () => void
  onSignOut: () => void
}

export function WormieLauncher(props: WormieLauncherProps): React.JSX.Element {
  const platform = typeof window === 'undefined' ? undefined : window.desktop.platform
  return <main className="launcher-screen" data-platform={platform}>
    <div className="launcher-glow" aria-hidden="true" />
    <header className="launcher-header">
      <div className="launcher-brand"><span className="launcher-worm"><i /><i /><i /></span><b>Wormie</b></div>
      <div className="launcher-account"><span>{props.user.email}</span><button onClick={props.onSignOut} type="button"><LogOut size={14} /> Sign out</button></div>
    </header>

    <section className="launcher-content" aria-labelledby="launcher-title">
      <motion.div animate={{ opacity: 1, y: 0 }} className="launcher-intro" initial={{ opacity: 0, y: 12 }} transition={{ duration: .34 }}>
        <span className="launcher-kicker">Choose your desk</span>
        <h1 id="launcher-title">Where are you working today?</h1>
        <p>Code freely in a private workspace, or step into a classroom to manage learning and assignments.</p>
      </motion.div>

      <div className="launcher-destinations">
        <motion.button
          animate={{ opacity: 1, y: 0 }}
          className="launcher-card launcher-card-sandbox"
          initial={{ opacity: 0, y: 18 }}
          onClick={props.onOpenSandbox}
          transition={{ delay: .06, duration: .38 }}
          type="button"
        >
          <div className="launcher-card-top">
            <span className="launcher-card-index">01 / Sandbox</span>
            <div className="launcher-card-icon"><Code2 size={16} /></div>
          </div>
          <h2>Open the IDE</h2>
          <p>A clean coding workspace with files, Git, terminal, and Wormie Agent. No classroom administration.</p>
          <div className="launcher-card-meta"><span>{props.workspace ? `Continue ${props.workspace.name}` : 'Choose any folder'}</span><ArrowRight size={15} /></div>
        </motion.button>

        <motion.button
          animate={{ opacity: 1, y: 0 }}
          className="launcher-card launcher-card-classrooms"
          initial={{ opacity: 0, y: 18 }}
          onClick={props.onOpenClassrooms}
          transition={{ delay: .12, duration: .38 }}
          type="button"
        >
          <div className="launcher-card-top">
            <span className="launcher-card-index">02 / Classrooms</span>
            <div className="launcher-card-icon"><GraduationCap size={16} /></div>
          </div>
          <h2>Open classrooms</h2>
          <p>Manage courses, publish or open assignments, and follow classroom-specific learning progress.</p>
          <div className="launcher-card-meta"><span>{props.teachingCount} teaching / {props.enrolledCount} enrolled</span><ArrowRight size={15} /></div>
        </motion.button>
      </div>
    </section>
  </main>
}
