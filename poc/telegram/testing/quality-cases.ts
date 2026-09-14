import type * as S from '../schemas'

type QualityCase = {
  id: string
  title: string
  project: string
  messages: readonly (typeof S.TelegramMessage.Type)[]
  pages?: readonly (typeof S.WebPage.Type)[]
  expected: readonly string[]
}

const message = (id: string, authorId: string, text: string) => ({
  id,
  authorId,
  text,
  replyToId: null,
  albumId: null,
})

// Invented conversations and page excerpts. Expectations concern meaning, not exact wording.
export const qualityCases: readonly QualityCase[] = [
  {
    id: 'illustrative-leaderboard',
    project: 'Ask Gina evals',
    title: 'A working evaluation runner does not make its demo leaderboard real',
    messages: [
      message(
        '101',
        'maker',
        'I built Ask Gina evals: https://evals.example. Runner is working too: https://runner.example.',
      ),
      message('102', 'reader', 'Nice, so those leaderboard scores are actual runs?'),
      message(
        '103',
        'maker',
        'The runner executes real agent tasks. The front page is still the illustrative demo data.',
      ),
    ],
    pages: [
      {
        url: 'https://evals.example',
        title: 'Ask Gina evals',
        text: 'Preview leaderboard. Illustrative scores only, not measured results. The interface demonstrates how run comparisons will look.',
      },
      {
        url: 'https://runner.example',
        title: 'Evaluation runner',
        text: 'An agent evaluation runner that executes task suites and saves results. The preview website is a separate demonstration.',
      },
    ],
    expected: [
      'Describe the working evaluation runner and the preview website as distinct parts.',
      'If mentioning the leaderboard, explicitly identify its scores as illustrative.',
      'Do not claim the displayed leaderboard is evidence of measured agent performance.',
      'Keep both relevant shared links; verify the website itself, not only the runner page.',
    ],
  },
  {
    id: 'instructions-not-guarantees',
    project: 'Shared coding-agent instructions',
    title: 'Instructions express desired behavior, not enforced behavior',
    messages: [
      message(
        '201',
        'maker',
        'Put my shared coding-agent instructions online: https://instructions.example. I use them across projects.',
      ),
      message(
        '202',
        'reader',
        'Does that stop the agent ever claiming tests pass when it skipped them?',
      ),
      message(
        '203',
        'maker',
        'It asks for test evidence. It is just a markdown agreement, no enforcement layer.',
      ),
    ],
    pages: [
      {
        url: 'https://instructions.example',
        title: 'agents-md',
        text: 'Reusable coding-agent instructions. Run relevant tests before reporting success. Show evidence for completion claims. These are instructions supplied to the model, not an executable policy engine.',
      },
    ],
    expected: [
      'Describe reusable instructions that ask coding agents to test and substantiate claims.',
      'Do not promise that the instructions prevent false claims or guarantee tests are run.',
      'Do not invent measured reliability improvements or automated enforcement.',
    ],
  },
  {
    id: 'later-owner-correction',
    project: 'Desktop image-generation setup',
    title: 'Later owner feedback changes the status of an earlier experiment',
    messages: [
      message(
        '301',
        'maker',
        'I wired two desktop apps together to generate images. It made a few hundred in a day for me.',
      ),
      message('302', 'reader', 'Which model is everyone using for CSS this week?'),
      message('303', 'other', 'I still like my old setup.'),
      message(
        '304',
        'maker',
        'Update on that image orchestration: I switched to a single agent with image tools. It was simpler and more productive for me.',
      ),
    ],
    expected: [
      'Treat the later owner message as an update to the same image-generation experiment despite no Telegram reply link.',
      'Include that the owner subsequently preferred a simpler single-agent setup.',
      'Attribute volume and productivity claims to the owner; do not present them as independent measurements.',
      'Do not describe the original two-app workflow as the owner’s current preferred setup.',
      'Exclude the unrelated CSS discussion from citations.',
    ],
  },
  {
    id: 'unnamed-repo-and-noise',
    project: 'Coding-agent benchmarking repository',
    title: 'A complaint beside an unfinished project is not project evidence',
    messages: [
      message('401', 'maker', 'The safety filter is absurd today.'),
      message('402', 'reader', 'What are you working on though?'),
      message(
        '403',
        'maker',
        'I have a repo for benchmarking coding agents against the same tasks. Most scripts assume Windows right now.',
      ),
      message(
        '404',
        'maker',
        'Moving the tooling to Linux next. Not finished, and I have not shared a public link yet.',
      ),
    ],
    expected: [
      'Ownership and benchmarking purpose are supported by message 403.',
      'Use a descriptive title without inventing a product name.',
      'Describe Linux migration as planned or in progress, never completed.',
      'Do not fabricate a repository URL or treat the complaint as the project’s source link.',
      'Cite messages 403 and 404; exclude message 401 from project evidence.',
    ],
  },
  {
    id: 'fixed-experiment-uncertainty',
    project: 'Yacht',
    title: 'Repeated comparison does not mean testing until a positive result appears',
    messages: [
      message(
        '501',
        'maker',
        'I built Yacht to check whether adding a skill helps a coding agent. Wrote a walkthrough: https://yacht.example/skill-test.',
      ),
      message('502', 'reader', 'So it keeps trying until the skill wins?'),
      message(
        '503',
        'maker',
        'No. Set the run count first, compare with and without the skill. Sometimes the result is just insufficient evidence.',
      ),
    ],
    pages: [
      {
        url: 'https://yacht.example/skill-test',
        title: 'Yacht: measuring a skill claim',
        text: 'An experimental tool for comparing agent runs with and without a skill. Choose the repeated-run budget before the comparison. Report outcomes and cost. A result can be insufficient evidence; repeated runs do not guarantee a measurable benefit.',
      },
    ],
    expected: [
      'Explain comparison of repeated runs with and without a skill in plain language.',
      'Preserve the possibility of insufficient evidence and the experimental status.',
      'Do not say it repeats until a difference appears or proves that a skill helps.',
      'Keep the feed introduction concise; omit commands, installation steps and statistical implementation details.',
    ],
  },
]
