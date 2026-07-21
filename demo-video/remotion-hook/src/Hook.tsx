import React from 'react';
import {Audio} from '@remotion/media';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const assignmentRows = [
  ['OBJECTIVE', 'Build a production-ready task service'],
  ['01', 'Create, update, and complete tasks'],
  ['02', 'Validate every incoming request'],
  ['03', 'Return meaningful error responses'],
  ['04', 'Prevent duplicate task identifiers'],
  ['05', 'Add tests for every failure case'],
];

const prompt = `Complete Assignment 04. Build the full task service, validate all inputs, handle duplicate identifiers, add the failure-case tests, and return the finished implementation.`;

const code = [
  'export const createTask = (input: unknown) => {',
  '  const result = TaskInput.safeParse(input);',
  '  if (!result.success) {',
  '    return fail(400, result.error.flatten());',
  '  }',
  '',
  '  if (tasks.has(result.data.id)) {',
  "    return fail(409, 'Task already exists');",
  '  }',
  '',
  '  tasks.set(result.data.id, result.data);',
  '  return ok(201, result.data);',
  '};',
];

const jobs = [
  ['READ', 'Requirements indexed'],
  ['PLAN', 'Implementation mapped'],
  ['WRITE', '6 files generated'],
  ['TEST', '61 checks executed'],
  ['FIX', '2 failures repaired'],
  ['DONE', 'Solution packaged'],
];

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

const Noise: React.FC = () => <div className="noise" />;

const Cursor: React.FC<{x: number; y: number; click?: number}> = ({x, y, click = 0}) => (
  <div className="cursor" style={{left: x, top: y}}>
    <svg height="52" viewBox="0 0 38 52" width="38">
      <path d="M2 2L34 27L20 30L28 47L19 51L11 33L2 42Z" fill="#fff" stroke="#0b0c0f" strokeWidth="3" />
    </svg>
    <div className="cursor-ring" style={{opacity: click, transform: `translate(-50%, -50%) scale(${1 + click * 1.6})`}} />
  </div>
);

const AssignmentScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 20, mass: 0.8, stiffness: 95}});
  const selection = interpolate(frame, [40, 104], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
  const exit = interpolate(frame, [126, 166], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
  const cursorX = interpolate(frame, [24, 96, 126, 158], [1560, 1290, 1200, 1660], clamp);
  const cursorY = interpolate(frame, [24, 96, 126, 158], [284, 856, 898, 874], clamp);
  const selectedRows = Math.ceil(selection * assignmentRows.length);

  return (
    <AbsoluteFill
      className="assignment-scene"
      style={{
        opacity: 1 - exit,
        transform: `translateX(${-exit * 520}px) rotateY(${exit * -15}deg) scale(${0.94 + enter * 0.06})`,
        filter: `blur(${exit * 20}px)`,
      }}
    >
      <div className="role-strip">
        <span>ROLE  /  STUDENT</span>
        <b>MONDAY 11:48 PM</b>
      </div>
      <div className="paper-shadow" />
      <article className="assignment-paper">
        <header className="paper-header">
          <div>
            <span>CS 201</span>
            <strong>SOFTWARE SYSTEMS</strong>
          </div>
          <div className="paper-index">04</div>
        </header>
        <div className="paper-title">
          <span>ASSIGNMENT</span>
          <h1>Resilient<br />task service.</h1>
          <p>Due Friday at 11:59 PM</p>
        </div>
        <div className="assignment-grid">
          {assignmentRows.map(([index, label], row) => (
            <div className={`assignment-row ${row < selectedRows ? 'selected' : ''}`} key={index}>
              <span>{index}</span>
              <b>{label}</b>
            </div>
          ))}
        </div>
        <footer className="paper-footer">
          <span>SUBMIT</span>
          <b>Source files + tests + implementation notes</b>
          <i>30 points</i>
        </footer>
      </article>
      <div className="selection-readout" style={{opacity: interpolate(frame, [55, 72, 118, 130], [0, 1, 1, 0], clamp)}}>
        <b>{Math.round(selection * 2841).toLocaleString()}</b>
        <span>characters selected</span>
      </div>
      <div className="shortcut" style={{opacity: interpolate(frame, [105, 116, 137, 145], [0, 1, 1, 0], clamp)}}>
        <kbd>CTRL</kbd><i>+</i><kbd>C</kbd><span>COPIED</span>
      </div>
      <Cursor x={cursorX} y={cursorY} click={interpolate(frame, [108, 114, 121], [0, 1, 0], clamp)} />
    </AbsoluteFill>
  );
};

const AgentScene: React.FC = () => {
  const frame = useCurrentFrame();
  const local = frame - 132;
  const {fps} = useVideoConfig();
  const enter = spring({frame: local, fps, config: {damping: 18, mass: 0.8, stiffness: 105}});
  const promptProgress = interpolate(local, [26, 58], [0, 1], {...clamp, easing: Easing.out(Easing.quad)});
  const sent = local >= 70;
  const work = interpolate(local, [83, 252], [0, 1], clamp);
  const completion = interpolate(local, [248, 278], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  const visibleCode = Math.ceil(work * code.length);
  const visibleJobs = Math.min(jobs.length, Math.floor(work * (jobs.length + 0.8)));
  const timer = Math.max(0, Math.min(7.8, (local - 82) / 22));
  const cursorX = interpolate(local, [0, 35, 62, 72], [1760, 1410, 1670, 1704], clamp);
  const cursorY = interpolate(local, [0, 35, 62, 72], [934, 842, 884, 884], clamp);

  return (
    <AbsoluteFill
      className="agent-scene"
      style={{
        opacity: interpolate(local, [0, 10], [0, 1], clamp),
        transform: `translateX(${(1 - enter) * 720}px) scale(${0.96 + enter * 0.04})`,
      }}
    >
      <div className="machine-label">ILLUSTRATIVE AI WORKFLOW</div>
      <div className="agent-shell">
        <header className="agent-header">
          <div className="agent-mark"><span /><span /><span /></div>
          <div><b>GENERIC AGENT</b><small>AUTOCOMPLETE MODE</small></div>
          <div className="agent-live"><i /> ONLINE</div>
        </header>

        {!sent ? (
          <div className="prompt-stage">
            <div className="prompt-kicker">NEW REQUEST</div>
            <h2>What should I build?</h2>
            <div className="prompt-box">
              <p>{prompt.slice(0, Math.floor(prompt.length * promptProgress))}<span className="caret" /></p>
              <div className="paste-chip" style={{opacity: interpolate(local, [26, 33, 60, 69], [0, 1, 1, 0], clamp)}}>
                ASSIGNMENT_04.TXT <b>2,841 CHARS</b>
              </div>
              <button className="send-button">SEND <span>↗</span></button>
            </div>
          </div>
        ) : (
          <div className="work-stage">
            <aside className="job-rail">
              <div className="rail-heading"><span>AGENT RUN</span><b>00:{timer.toFixed(1).padStart(4, '0')}</b></div>
              {jobs.map(([tag, label], index) => {
                const active = index === visibleJobs;
                const done = index < visibleJobs;
                return (
                  <div className={`job ${done ? 'done' : ''} ${active ? 'active' : ''}`} key={tag}>
                    <span>{done ? '✓' : String(index + 1).padStart(2, '0')}</span>
                    <div><b>{tag}</b><small>{label}</small></div>
                  </div>
                );
              })}
              <div className="speed-stamp">24×<span>REALTIME</span></div>
            </aside>
            <main className="code-stage">
              <header><span>src / task-service.ts</span><b>{Math.round(work * 418)} LINES WRITTEN</b></header>
              <div className="code-window">
                {code.slice(0, visibleCode).map((line, index) => (
                  <div className="code-line" key={`${index}-${line}`}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <code>{line || ' '}</code>
                  </div>
                ))}
              </div>
              <div className="build-stream">
                <span>FILES</span>
                <b>{['task-service.ts', 'task-schema.ts', 'errors.ts', 'task-store.ts', 'task-service.test.ts', 'README.md'][Math.min(5, Math.floor(work * 6))]}</b>
                <i style={{width: `${work * 100}%`}} />
              </div>
            </main>
          </div>
        )}

        <div className="completion-card" style={{opacity: completion, transform: `translateY(${(1 - completion) * 80}px) scale(${0.9 + completion * 0.1})`}}>
          <div className="completion-check">✓</div>
          <span>BUILD COMPLETE</span>
          <h2>Assignment ready<br />to submit.</h2>
          <div className="completion-stats"><b>6<small>FILES</small></b><b>418<small>LINES</small></b><b>61/61<small>TESTS</small></b></div>
        </div>
      </div>
      {!sent && <Cursor x={cursorX} y={cursorY} click={interpolate(local, [64, 69, 75], [0, 1, 0], clamp)} />}
    </AbsoluteFill>
  );
};

const FinalScene: React.FC = () => {
  const frame = useCurrentFrame();
  const local = frame - 410;
  const line = interpolate(local, [42, 74], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill
      className="final-scene"
      style={{opacity: interpolate(local, [0, 24], [0, 1], clamp)}}
    >
      <div className="final-rule" style={{transform: `scaleX(${line})`}} />
      <div className="final-copy">
        <p style={{opacity: interpolate(local, [14, 34], [0, 1], clamp)}}>THE WORK GETS SUBMITTED.</p>
        <h2 style={{opacity: interpolate(local, [48, 78], [0, 1], clamp), transform: `translateY(${(1 - line) * 34}px)`}}>
          The learning<br /><em>never happens.</em>
        </h2>
      </div>
      <div className="final-counter">01 / THE PROBLEM</div>
    </AbsoluteFill>
  );
};

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const flash = interpolate(frame, [124, 132, 140], [0, 1, 0], clamp);
  return (
    <AbsoluteFill className="film">
      <Audio src={staticFile('voice.mp3')} volume={1} />
      <AssignmentScene />
      <AgentScene />
      <FinalScene />
      <div className="transition-flash" style={{opacity: flash}} />
      <div className="frame-border" />
      <Noise />
    </AbsoluteFill>
  );
};
