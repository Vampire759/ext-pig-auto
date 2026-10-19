// AI生成
// 小猪离线自动管家 v1.1（用户 2026-10-20 定：离线自动学习/进食/洗澡/玩耍/赚钱；
// 学习分小学→中学→大学→研究生→学无止境，每学段各门科目，一键领取，最长补 72 小时）。
// 机制：打开自动后按真实时间补算（一次最多 72 小时），每 5 分钟一轮打工赚管家币；
// 学习：每学 2 小时学完一门课，学完学段全部科目升入下一学段；学无止境科目循环、每轮效率 +0.1；
// 自理：每 2 小时进食 -20 币、每 1.5 小时玩耍 -10 币、每 3 小时洗澡 -15 币。
import assert from 'node:assert/strict'
import { test } from 'node:test'

import pigAuto, {
  ROUND_MS, CAP_MS, MAX_ROUNDS, WORK_BASE, STUDY_PER_SUBJECT_MS, FOREVER_STEP,
  STAGES, FEED_EVERY, FEED_COST, BATHE_EVERY, BATHE_COST, PLAY_EVERY, PLAY_COST,
  plan, normalize, effOf, subjectStatus, bestJob, jobRate, exportData, importData, JOBS,
} from '../extensions/pig-auto/server.js'

const H = 3600000
const T0 = new Date('2026-10-20T12:00:00+08:00').getTime()
const SUBJECT_TOTAL = STAGES.reduce((sum, stage) => sum + stage.subjects.length, 0)

/** 有管家币钱包的假宿主；noWallet 模拟老宿主（没钱包→只记账不结账）。 */
export function fakeApi(now0 = T0, opts = {}) {
  let balance = opts.noWallet ? 0 : 100_000
  const said = []
  const ledger = []
  const api = {
    now: now0,
    coins: () => 0,
    wallet: opts.noWallet ? null : {
      currency: { label: '管家币', emoji: '\U0001FA99', rate: 0.5 },
      balance: () => balance,
      earn(n, source) { balance += n; ledger.push(['in', source, n]); return n },
      spend(n, sink) { if (balance < n) return false; balance -= n; ledger.push(['out', sink, n]); return true },
    },
    say(line) { said.push(line) },
  }
  return { api, balance: () => balance, ledger, said }
}

test('学段表：小学→中学→大学→研究生→学无止境，共 24 门科目，效率 1.0/1.2/1.4/1.6/2.0', () => {
  assert.deepEqual(STAGES.map(s => [s.key, s.label, s.eff]), [
    ['primary', '小学', 1.0],
    ['middle', '中学', 1.2],
    ['college', '大学', 1.4],
    ['postgrad', '研究生', 1.6],
    ['forever', '学无止境', 2.0],
  ])
  assert.deepEqual(STAGES.map(s => s.subjects.length), [4, 8, 5, 3, 4])
  assert.equal(SUBJECT_TOTAL, 24)
  assert.deepEqual(STAGES[0].subjects.map(s => s.label), ['语文', '数学', '英语', '科学'])
  assert.deepEqual(STAGES[4].subjects.map(s => s.label), ['跨学科', '创造学', '智慧学', '修身养性'])
  assert.equal(effOf({ stage: 0, rounds: 0 }), 1.0)
  assert.equal(effOf({ stage: 4, rounds: 0 }), 2.0)
  assert.equal(effOf({ stage: 4, rounds: 3 }), 2.3, '学无止境每轮 +0.1')
})

test('常量：一轮 5 分钟、封顶 72 小时 = 864 轮、一门课 2 小时、自理开销', () => {
  assert.equal(ROUND_MS, 5 * 60 * 1000)
  assert.equal(CAP_MS, 72 * H)
  assert.equal(MAX_ROUNDS, 864)
  assert.deepEqual([WORK_BASE, STUDY_PER_SUBJECT_MS, FOREVER_STEP], [10, 2 * H, 0.1])
  assert.deepEqual([FEED_EVERY, FEED_COST], [24, 20])
  assert.deepEqual([BATHE_EVERY, BATHE_COST], [36, 15])
  assert.deepEqual([PLAY_EVERY, PLAY_COST], [18, 10])
  assert.deepEqual(pigAuto.init(), {
    on: false, study: true, work: true, lastAt: 0, stage: 0, subject: 0, studyMs: 0, rounds: 0, studied: 0,
    stats: { work: 0, feed: 0, bathe: 0, play: 0, spent: 0 },
  })
})

test('开关：开启记起始时间，立刻领 0 轮；10 分钟后 2 轮 20 币；关掉时先结算、关后拒领', () => {
  const t = fakeApi()
  const d = pigAuto.init()
  assert.equal(pigAuto.actions.toggle(d, {}, t.api).ok, true)
  assert.equal(d.on, true)
  assert.equal(d.lastAt, T0)
  assert.deepEqual(pigAuto.actions.claim(d, {}, t.api).rounds, 0)
  t.api.now = T0 + 10 * 60 * 1000
  const r = pigAuto.actions.claim(d, {}, t.api)
  assert.deepEqual([r.rounds, r.earned, r.spent, r.stage], [2, 20, 0, 0])
  assert.deepEqual(t.ledger, [['in', 'work', 20]])
  assert.equal(d.lastAt, t.api.now)
  t.api.now = T0 + 20 * 60 * 1000
  const off = pigAuto.actions.toggle(d, {}, t.api)
  assert.equal(off.on, false)
  assert.deepEqual(pigAuto.actions.claim(d, {}, t.api), { ok: false, reason: 'unavailable' })
})

test('离线 1 小时：12 轮 120 币；语文学到一半，没到任何自理点', () => {
  const d = pigAuto.init()
  const t = fakeApi()
  pigAuto.actions.toggle(d, {}, t.api)
  t.api.now = T0 + H
  const p = plan(d, d.lastAt, t.api.now)
  assert.deepEqual([p.rounds, p.work, p.studied, p.up], [12, 120, 0, 0])
  assert.deepEqual([p.stage, p.subject, p.studyMs], [0, 0, H], '小学·语文 50%')
  const r = pigAuto.actions.claim(d, {}, t.api)
  assert.deepEqual([r.earned, r.spent, r.feed, r.bathe, r.play], [120, 0, 0, 0, 0])
  assert.match(t.said[0], /离线 1 小时/)
})

test('离线 6 小时：72 轮 720 币（小学效率 1.0），学完语文数学英语，自理 3 吃 2 洗 4 玩', () => {
  const d = pigAuto.init()
  const t = fakeApi()
  pigAuto.actions.toggle(d, {}, t.api)
  t.api.now = T0 + 6 * H
  const p = plan(d, d.lastAt, t.api.now)
  assert.deepEqual([p.rounds, p.work, p.studied, p.up], [72, 720, 3, 0])
  assert.deepEqual([p.stage, p.subject, p.studyMs], [0, 3, 0], '学完 3 门，正在学第 4 门（科学）')
  assert.deepEqual([p.feed, p.bathe, p.play], [3, 2, 4])
  assert.equal(p.spent, 3 * FEED_COST + 2 * BATHE_COST + 4 * PLAY_COST)
  const r = pigAuto.actions.claim(d, {}, t.api)
  assert.deepEqual([r.earned, r.spent, r.feed, r.bathe, r.play, r.studied], [720, 130, 3, 2, 4, 3])
  assert.deepEqual(t.ledger.filter(row => row[0] === 'in'), [['in', 'work', 720]])
  assert.deepEqual(t.ledger.filter(row => row[0] === 'out'), [
    ['out', 'feed', 20], ['out', 'feed', 20], ['out', 'feed', 20],
    ['out', 'bathe', 15], ['out', 'bathe', 15],
    ['out', 'play', 10], ['out', 'play', 10], ['out', 'play', 10], ['out', 'play', 10],
  ], '自理开销逐笔记账')
  assert.deepEqual(d.stats, { work: 720, feed: 3, bathe: 2, play: 4, spent: 130 })
})

test('离线 8 小时：小学毕业升入中学，效率从 1.0 提到 1.2', () => {
  const d = pigAuto.init()
  const t = fakeApi()
  pigAuto.actions.toggle(d, {}, t.api)
  t.api.now = T0 + 8 * H
  const p = plan(d, d.lastAt, t.api.now)
  assert.deepEqual([p.rounds, p.work, p.studied, p.up], [96, 960, 4, 1])
  assert.deepEqual([p.stage, p.subject, p.studyMs], [1, 0, 0], '中学·语文开头')
  // plan 是纯计算：从 T0 从头算 10 小时 = 小学 4 门（8 小时）+ 中学语文 1 门（后 2 小时按效率 1.2）
  t.api.now = T0 + 10 * H
  const p2 = plan(d, d.lastAt, t.api.now)
  assert.deepEqual([p2.rounds, p2.work, p2.studied], [120, 960 + 24 * 12, 5], '小学 4 门 + 中学语文 1 门')
  assert.deepEqual([p2.stage, p2.subject, p2.studyMs], [1, 1, 0])
})

test('离线 24 小时：小学 + 中学毕业进大学，手算 3264 币', () => {
  const d = pigAuto.init()
  const t = fakeApi()
  pigAuto.actions.toggle(d, {}, t.api)
  t.api.now = T0 + 24 * H
  const p = plan(d, d.lastAt, t.api.now)
  // 小学 96 轮 ×10 = 960 + 中学 192 轮 ×12 = 2304
  assert.deepEqual([p.rounds, p.work, p.studied, p.up], [288, 3264, 12, 2])
  assert.deepEqual([p.stage, p.subject], [2, 0], '大学·高等数学开头')
  assert.deepEqual([p.feed, p.bathe, p.play, p.spent], [12, 8, 16, 520])
})

test('离线 72 小时满分：五学段走完进学无止境第 4 轮，手算 14352 币；100 小时也只补 72 小时', () => {
  const d = pigAuto.init()
  const t = fakeApi()
  pigAuto.actions.toggle(d, {}, t.api)
  t.api.now = T0 + 72 * H
  const p = plan(d, d.lastAt, t.api.now)
  // 小学 96×10 + 中学 192×12 + 大学 120×14 + 研究生 72×16 + 学无止境 384 轮（4 个循环，eff 2.0/2.1/2.2/2.3）
  const work = 96 * 10 + 192 * 12 + 120 * 14 + 72 * 16 + 96 * 20 + 96 * 21 + 96 * 22 + 96 * 23
  assert.equal(work, 14352)
  assert.deepEqual([p.rounds, p.work, p.up], [864, 14352, 4])
  assert.deepEqual([p.stage, p.subject, p.roundsForever], [4, 0, 4], '学无止境第 4 轮开头')
  assert.equal(p.studiedTotal, 4 + 8 + 5 + 3 + 16, '共学完 36 门课')
  assert.deepEqual([p.feed, p.bathe, p.play, p.spent], [36, 24, 48, 1560])
  // 100 小时只补 72 小时：结果一模一样
  const d2 = pigAuto.init()
  const t2 = fakeApi()
  pigAuto.actions.toggle(d2, {}, t2.api)
  t2.api.now = T0 + 100 * H
  const p2 = plan(d2, d2.lastAt, t2.api.now)
  assert.deepEqual([p2.rounds, p2.work, p2.roundsForever], [864, 14352, 4])
  const r = pigAuto.actions.claim(d2, {}, t2.api)
  assert.deepEqual([r.earned, r.spent, r.studied, r.stage], [14352, 1560, 36, 4])
})

test('旧 v1.0 存档无损迁移：level 折算成学段进度，统计清零重算', () => {
  // level 5 = 已学 4×2 小时 = 小学毕业
  const old = { on: true, lastAt: T0 - 2 * H, level: 5, studyMs: 0, stats: { work: 999, feed: 9, bathe: 9, play: 9, spent: 9 } }
  const d = normalize(old)
  assert.deepEqual([d.stage, d.subject, d.studyMs, d.studied, d.rounds], [1, 0, 0, 4, 0], '8 小时学习 → 中学开头')
  assert.deepEqual(d.stats, { work: 0, feed: 0, bathe: 0, play: 0, spent: 0 }, '旧统计与新效率不可比，清零')
  assert.equal(d.on, true)
  assert.equal(d.lastAt, T0 - 2 * H)
  // level 2 + 1 小时 = 已学 3 小时 = 语文读完 + 数学读到一半
  const old2 = { on: true, lastAt: T0, level: 2, studyMs: H }
  const d2 = normalize(old2)
  assert.deepEqual([d2.stage, d2.subject, d2.studyMs, d2.studied], [0, 1, H, 1])
  // 迁移后能接着算：再挂 1 小时，数学读完
  const t = fakeApi()
  t.api.now = T0 + H
  const p = plan(d2, T0, t.api.now)
  assert.deepEqual([p.studied, p.subject, p.studyMs], [1, 2, 0], '数学学完，正在学英语')
})

test('view 只算不写：开着时预告可领与学习推进，关着时没有预告', () => {
  const d = pigAuto.init()
  const t = fakeApi()
  pigAuto.actions.toggle(d, {}, t.api)
  t.api.now = T0 + H
  const v = pigAuto.view(d, t.api)
  assert.equal(v.on, true)
  assert.deepEqual([v.pending.rounds, v.pending.work, v.pending.studied], [12, 120, 0])
  assert.equal(v.balance, 100_000)
  assert.equal(v.stage, 0)
  assert.equal(v.studied, 0)
  assert.equal(d.lastAt, T0, 'view 不推进 lastAt')
  assert.equal(t.ledger.length, 0, 'view 不动钱包')
  assert.equal(v.stages.length, 5, '学段表传给面板渲染')
  pigAuto.actions.toggle(d, {}, t.api)
  const v2 = pigAuto.view(d, t.api)
  assert.equal(v2.on, false)
  assert.equal(v2.pending, null)
})

test('没钱包（老宿主）不崩：只记账不结账，学习照常推进', () => {
  const d = pigAuto.init()
  const t = fakeApi(T0, { noWallet: true })
  assert.equal(t.api.wallet, null)
  pigAuto.actions.toggle(d, {}, t.api)
  t.api.now = T0 + 6 * H
  const r = pigAuto.actions.claim(d, {}, t.api)
  assert.deepEqual([r.earned, r.spent, r.feed, r.bathe, r.play], [0, 0, 0, 0, 0])
  assert.deepEqual([r.studied, r.stage, r.subject], [3, 0, 3], '学习不看钱包')
  assert.deepEqual(d.stats, { work: 0, feed: 0, bathe: 0, play: 0, spent: 0 })
})

test('小数点轮次不吃亏：不满一轮的时间攒着，下一轮一并算', () => {
  const d = pigAuto.init()
  const t = fakeApi()
  pigAuto.actions.toggle(d, {}, t.api)
  t.api.now = T0 + 5 * 60 * 1000 + 59_999 // 差 1 毫秒到第二轮
  const r1 = pigAuto.actions.claim(d, {}, t.api)
  assert.equal(r1.rounds, 1)
  t.api.now = T0 + 10 * 60 * 1000 + 60_000
  const r2 = pigAuto.actions.claim(d, {}, t.api)
  assert.equal(r2.rounds, 1)
  assert.equal(t.balance(), 100_000 + 20, '两次合计 2 轮 20 币')
})

test('学过判断 subjectStatus：每门学科标 已学/在学/未学，顺序模型按指针推导', () => {
  const d = pigAuto.init()
  let st = subjectStatus(d)
  assert.equal(st.length, 5)
  assert.equal(st[0].subjects[0].status, 'learn', '起点第 1 门正在学')
  assert.ok(st[0].subjects.slice(1).every(s => s.status === 'todo'))
  assert.ok(st.slice(1).every(s => s.subjects.every(x => x.status === 'todo')), '后面学段全未学')
  // 小学第 3 门进行中：前两门已学过
  d.subject = 2
  st = subjectStatus(d)
  assert.deepEqual(st[0].subjects.map(s => s.status), ['done', 'done', 'learn', 'todo'])
  assert.equal(st[0].done, false, '小学还没毕业')
  // 升入中学：小学整段 ✅ 已毕业
  d.stage = 1
  d.subject = 0
  st = subjectStatus(d)
  assert.ok(st[0].subjects.every(s => s.status === 'done'))
  assert.equal(st[0].done, true)
  assert.equal(st[1].subjects[0].status, 'learn', '中学语文正在学')
  assert.ok(st.slice(2).every(s => s.subjects.every(x => x.status === 'todo')))
  // 学无止境第 3 轮第 2 门：前四学段全毕业，本轮第 1 门已学、第 2 门在学
  d.stage = 4
  d.subject = 1
  d.rounds = 2
  st = subjectStatus(d)
  assert.deepEqual(st[4].subjects.map(s => s.status), ['done', 'learn', 'todo', 'todo'])
  // view 带出 statuses 给面板渲染
  const t = fakeApi()
  const v = pigAuto.view(d, t.api)
  assert.equal(v.statuses.length, 5)
  assert.equal(v.statuses[0].done, true)
  // v1.0 旧存档迁移后：小学毕业、中学第 1 门在学
  const old = normalize({ on: true, lastAt: T0, level: 5, studyMs: 0, stats: {} })
  st = subjectStatus(old)
  assert.ok(st[0].subjects.every(s => s.status === 'done'))
  assert.equal(st[1].subjects[0].status, 'learn')
})


// ================= v1.3：学习/赚钱双开关 + 最高价值工作 + 导出导入 =================

test('v1.3 双开关：默认学习和赚钱都开；旧存档自动补上默认值', () => {
  const d = pigAuto.init()
  assert.equal(d.study, true)
  assert.equal(d.work, true)
  const old = normalize({ on: true, lastAt: T0, level: 1, studyMs: 5000, stats: {} })
  assert.equal(old.study, true, '旧存档默认学习开')
  assert.equal(old.work, true, '旧存档默认赚钱开')
})

test('v1.3 只开赚钱：不学习、只打工；只开学习：不打工、纯学习', () => {
  // 只开赚钱：study=false -> plan 不推进学习
  const d = pigAuto.init()
  d.study = false
  d.work = true
  const p = plan(d, T0, T0 + 24 * H)
  assert.equal(p.studied, 0, '不学习')
  assert.equal(p.up, 0)
  assert.deepEqual([p.stage, p.subject, p.studyMs], [0, 0, 0], '学段原地不动')
  assert.equal(p.work, 288 * 10, '24 小时 × 12 轮/时 × 10 币 = 2880（小学效率 1.0）')
  // 只开学习：work=false -> plan 不打工
  const d2 = pigAuto.init()
  d2.study = true
  d2.work = false
  const p2 = plan(d2, T0, T0 + 24 * H)
  assert.equal(p2.work, 0, '不打工')
  assert.equal(p2.studied, 12, '小学+中学 12 门课学完')
  assert.equal(p2.stage, 2, '升入大学')
})

test('v1.3 工作榜：学段越高解锁的工作越值钱；只开赚钱自动选已解锁最高价值工作', () => {
  assert.deepEqual(JOBS.map(j => [j.stage, j.label]), [
    [0, '搬砖'], [0, '发传单'], [1, '收银员'], [1, '快递员'], [2, '厨师'], [2, '律师'],
    [3, '程序员'], [3, '医生'], [4, '科研人员'], [4, '总裁'],
  ])
  // 小学：已解锁 搬砖/发传单（同价 10），取先到的搬砖
  let job = bestJob({ stage: 0, rounds: 0 })
  assert.deepEqual([job.key, job.label, job.coinsPerRound], ['bricks', '搬砖', 10])
  // 中学：收银员/快递员 12 币 > 小学 10 币 -> 收银员
  job = bestJob({ stage: 1, rounds: 0 })
  assert.deepEqual([job.key, job.label, job.coinsPerRound], ['cashier', '收银员', 12])
  // 大学：厨师 14 币
  job = bestJob({ stage: 2, rounds: 0 })
  assert.deepEqual([job.label, job.coinsPerRound], ['厨师', 14])
  // 研究生：程序员 16 币
  job = bestJob({ stage: 3, rounds: 0 })
  assert.deepEqual([job.label, job.coinsPerRound], ['程序员', 16])
  // 学无止境：科研人员 20 币；轮次涨了时薪也跟着涨（eff +0.1/轮）
  job = bestJob({ stage: 4, rounds: 0 })
  assert.deepEqual([job.label, job.coinsPerRound], ['科研人员', 20])
  job = bestJob({ stage: 4, rounds: 3 })
  assert.deepEqual([job.label, job.coinsPerRound], ['科研人员', 23])
  // jobRate：一份工作的时薪 = WORK_BASE × 学段效率
  assert.equal(jobRate(JOBS[0], { stage: 0, rounds: 0 }), 10)
  assert.equal(jobRate(JOBS[2], { stage: 1, rounds: 0 }), 12)
})

test('v1.3 开关动作：study/work 各自切换，不动对方', () => {
  const d = pigAuto.init()
  const t = fakeApi()
  let r = pigAuto.actions.study(d, { on: false }, t.api)
  assert.equal(r.study, false)
  assert.equal(d.work, true, '学习开关不影响赚钱')
  r = pigAuto.actions.work(d, { on: false }, t.api)
  assert.equal(r.work, false)
  assert.equal(d.study, false, '赚钱开关不影响学习')
  pigAuto.actions.study(d, { on: true }, t.api)
  pigAuto.actions.work(d, { on: true }, t.api)
  assert.deepEqual([d.study, d.work], [true, true])
})

test('v1.3 只开赚钱端到端：离线下单、一键领取只入账打工，不推进学习', () => {
  const d = pigAuto.init()
  const t = fakeApi()
  pigAuto.actions.study(d, { on: false }, t.api)
  pigAuto.actions.toggle(d, {}, t.api)
  t.api.now = T0 + 6 * H
  const r = pigAuto.actions.claim(d, {}, t.api)
  assert.equal(r.earned, 72 * 10, '6 小时 × 12 轮 × 10 币 = 720')
  assert.equal(r.studied, 0, '不学习')
  assert.deepEqual(t.ledger.filter(row => row[0] === 'in'), [['in', 'work', 720]])
  // 台词里提到正在打的工作
  assert.match(t.said[0], /搬砖/)
})

test('v1.3 导出：exportData 是可解析的存档串，含学习进度与统计', () => {
  const d = pigAuto.init()
  d.stage = 2
  d.subject = 1
  d.studyMs = 500_000
  d.rounds = 0
  d.studied = 12
  d.stats = { work: 3264, feed: 12, bathe: 8, play: 16, spent: 520 }
  const parsed = JSON.parse(exportData(d))
  assert.equal(parsed.format, 'pig-auto-save')
  assert.equal(parsed.version, 1)
  assert.deepEqual(parsed, {
    format: 'pig-auto-save', version: 1,
    stage: 2, subject: 1, studyMs: 500_000, rounds: 0, studied: 12,
    stats: { work: 3264, feed: 12, bathe: 8, play: 16, spent: 520 },
  })
})

test('v1.3 导入：合法串恢复学习进度；坏串一律拒绝且数据不动', () => {
  const d = pigAuto.init()
  d.stage = 2
  d.subject = 1
  d.studied = 13
  // 坏串：不是 JSON
  assert.equal(importData(d, 'not json').ok, false)
  // 坏串：格式不对
  assert.equal(importData(d, JSON.stringify({ format: 'other', stage: 1, subject: 0 })).ok, false)
  // 坏串：学段越界 / 科目越界
  assert.equal(importData(d, JSON.stringify({ format: 'pig-auto-save', stage: 9, subject: 0 })).ok, false)
  assert.equal(importData(d, JSON.stringify({ format: 'pig-auto-save', stage: 0, subject: 99 })).ok, false)
  assert.deepEqual([d.stage, d.subject, d.studied], [2, 1, 13], '失败的导入不改任何数据')
  // 合法串：考研·第 2 门，统计还原
  const good = { format: 'pig-auto-save', version: 1, stage: 3, subject: 1, studyMs: 1_000_000, rounds: 0, studied: 20, stats: { work: 999, feed: 5, bathe: 3, play: 8, spent: 230 } }
  assert.equal(importData(d, JSON.stringify(good)).ok, true)
  assert.deepEqual([d.stage, d.subject, d.studyMs, d.studied], [3, 1, 1_000_000, 20])
  assert.deepEqual(d.stats, { work: 999, feed: 5, bathe: 3, play: 8, spent: 230 })
  // 缺失字段容错：没有 stats 用全零
  const min = { format: 'pig-auto-save', stage: 1, subject: 0 }
  const d2 = pigAuto.init()
  assert.equal(importData(d2, JSON.stringify(min)).ok, true)
  assert.deepEqual(d2.stats, { work: 0, feed: 0, bathe: 0, play: 0, spent: 0 })
})

test('v1.3 导入动作：成功后计时点重置为现在，杜绝重复补算赚钱', () => {
  const d = pigAuto.init()
  const t = fakeApi()
  pigAuto.actions.toggle(d, {}, t.api)
  t.api.now = T0 + 3 * H
  // 先离线 3 小时入账 360 币
  pigAuto.actions.claim(d, {}, t.api)
  assert.equal(t.balance(), 100_000 + 360 - 55, '3 小时净入账：赚 360，自理 55（进食20+洗澡15+玩耍20）')
  // 把进度倒回小学开头再导入：钱包不变，计时点重置
  const serial = JSON.stringify({ format: 'pig-auto-save', version: 1, stage: 0, subject: 0, studyMs: 0, rounds: 0, studied: 0, stats: { work: 0, feed: 0, bathe: 0, play: 0, spent: 0 } })
  t.api.now = T0 + 4 * H
  const r = pigAuto.actions.import(d, { raw: serial }, t.api)
  assert.equal(r.ok, true)
  assert.equal(d.lastAt, T0 + 4 * H, '导入后从当下重新计时')
  assert.equal(d.studied, 0)
  // 再等 1 小时只补 1 小时：12 轮 120 币（无自理触发），不会把导入前的 3 小时再算一遍
  t.api.now = T0 + 5 * H
  const r2 = pigAuto.actions.claim(d, {}, t.api)
  assert.equal(r2.earned, 120)
  assert.equal(t.balance(), 100_000 + 360 - 55 + 120)
})

test('v1.3 view 带出开关、当前工作与导出串', () => {
  const d = pigAuto.init()
  const t = fakeApi()
  pigAuto.actions.toggle(d, {}, t.api)
  pigAuto.actions.work(d, { on: false }, t.api)
  t.api.now = T0 + H
  const v = pigAuto.view(d, t.api)
  assert.equal(v.on, true)
  assert.equal(v.study, true)
  assert.equal(v.work, false)
  assert.equal(v.currentJob.label, '搬砖')
  assert.deepEqual(v.pending.rounds == null ? null : [v.pending.rounds, v.pending.work], [12, 0], '只学习不打工：待领 0 币')
  assert.equal(typeof v.exportData, 'string')
  assert.equal(JSON.parse(v.exportData).studied, 0)
})

