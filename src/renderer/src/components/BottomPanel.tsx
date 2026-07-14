import { AlertCircle, CheckCircle2, TerminalSquare } from 'lucide-react'
import { useWorkbench } from '@/store/workbench'

export function BottomPanel(): React.JSX.Element {
  const bottomView = useWorkbench((state) => state.bottomView)
  const setBottomView = useWorkbench((state) => state.setBottomView)
  const output = useWorkbench((state) => state.output)

  return (
    <section className="bottom-panel">
      <div className="bottom-tabs">
        <button data-active={bottomView === 'problems'} onClick={() => setBottomView('problems')} type="button">Problems <span>0</span></button>
        <button data-active={bottomView === 'output'} onClick={() => setBottomView('output')} type="button">Output</button>
        <button data-active={bottomView === 'quiz'} onClick={() => setBottomView('quiz')} type="button">Quiz results</button>
      </div>
      <div className="bottom-content">
        {bottomView === 'output' && (
          <div className="output-lines">
            {output.map((line, index) => <p key={`${line}-${index}`}><TerminalSquare size={12} /> {line}</p>)}
          </div>
        )}
        {bottomView === 'problems' && <div className="empty-row"><CheckCircle2 size={14} /> No problems detected.</div>}
        {bottomView === 'quiz' && <div className="empty-row"><AlertCircle size={14} /> No quiz has been completed in this workspace.</div>}
      </div>
    </section>
  )
}

