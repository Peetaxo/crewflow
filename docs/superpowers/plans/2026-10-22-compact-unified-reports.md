# Compact unified report cards

**Goal:** Apply the accepted report design to both persisted shared rounds and original reports, with a smaller default footprint on mobile and desktop.

**Design:** One presentational `TimelogSummaryCard` owns the person/status header, event rows, compact hour/amount summary and spacing. Individual days are collapsed for original reports; shared rounds retain their guarded central editor and full membership. Returned reasons and changes awaiting Crew confirmation remain visible. Existing action handlers, role checks, grouping, monthly filters and calculations stay intact. No schema migration or conversion of old records is needed.

**Execution:** Continue in the existing clean `codex/timelog-card-layout` worktree. Implement inline, then request independent code review before integration. This is the user's requested refinement of the approved presentation spec; no new workflow choice is required.

## Tasks

- [ ] Add regression coverage in `src/views/TimelogsView.test.tsx`: original Crew reports expose the labelled hours/amount summary, keep dates and all days available under a closed details control, and retain edit/submit behavior. Verify RED with `node ./node_modules/vitest/vitest.mjs run src/views/TimelogsView.test.tsx`.
- [ ] Create `src/features/timelogs/components/TimelogSummaryCard.tsx` as a pure layout component. Share existing Czech hour/money/period display helpers with `SharedApprovalCard.tsx`. Use 12px mobile card padding, compact event rows and inline labelled totals; preserve 44px controls. Adapt original reports in both people and event views through one renderer, keeping old action guards and notices; remove duplicated original-card JSX.
- [ ] Adapt `src/features/shift-workflows/SharedApprovalCard.tsx` to the same layout, preserving frozen round totals/membership, missing-part guards, editor callbacks and history. Run both card/view suites plus shared workflow integration suites; fix failures without weakening identity or permission assertions.
- [ ] Inspect mixed original/shared reports in the local demo at desktop, 390px and 320px, including disclosure and no horizontal overflow. Record before/after card dimensions for equivalent shared data. Check CH/COO original controls without submitting financial decisions. Verify real original records in the simulator.
- [ ] Run the full test suite, production build, ESLint changed TS/TSX and diff check. Obtain independent review. Integrate into synchronized main, repeat required merged checks, push and run `npm run ios:refresh:devices` using preserved `.env.local` and existing signing team. Record simulator and phone results separately and keep demo running from main.

**Non-goals:** Invoice redesign, server logic, permission changes, approval decisions or mutations to real Staff financial data. Local synthetic fixture preparation is allowed only in the existing isolated demo.
