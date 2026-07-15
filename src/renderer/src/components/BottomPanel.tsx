import { CheckCircle2, TerminalSquare } from 'lucide-react'
import { TerminalPane } from '@/components/TerminalPane'
import { useWorkbench } from '@/store/workbench'
import { QuizHistory } from '@/components/QuizHistory'

export function BottomPanel(): React.JSX.Element {
  const bottomView = useWorkbench((state) => state.bottomView)
  const setBottomView = useWorkbench((state) => state.setBottomView)
  const output = useWorkbench((state) => state.output)
  const workspaceRoot = useWorkbench((state) => state.workspace?.rootPath ?? null)

  return (
    <section className="bottom-panel">
      <div className="bottom-tabs">
        <button data-active={bottomView === 'problems'} onClick={() => setBottomView('problems')} type="button">Problems <span>0</span></button>
        <button data-active={bottomView === 'output'} onClick={() => setBottomView('output')} type="button">Output</button>
        <button data-active={bottomView === 'terminal'} onClick={() => setBottomView('terminal')} type="button">Terminal</button>
        <button data-active={bottomView === 'quiz'} onClick={() => setBottomView('quiz')} type="button">Quiz results</button>
      </div>
      <div className="bottom-content" data-terminal={bottomView === 'terminal'}>
        {bottomView === 'output' && (
          <div className="output-lines">
            {output.map((line, index) => <p key={`${line}-${index}`}><TerminalSquare size={12} /> {line}</p>)}
          </div>
        )}
        {bottomView === 'problems' && <div className="empty-row"><CheckCircle2 size={14} /> No problems detected.</div>}
        {bottomView === 'quiz' && <QuizHistory />}
        <div className="terminal-host" data-active={bottomView === 'terminal'}>
          <TerminalPane active={bottomView === 'terminal'} workspaceRoot={workspaceRoot} />
        </div>
      </div>
    </section>
  )
}
