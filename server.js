// AI生成
// @ts-check
// 小猪离线自动管家 v1.3（用户 2026-10-20 定）：
// 打开自动后，猪离线多久就自动「学习 + 赚钱 + 自理」多久，按真实时间补算，一次最多补 72 小时，电脑重新打开后一键领取。
// v1.3 新功能：学习 / 赚钱两个独立开关，可只学、只赚、或两个都开（兼顾）。
//   - 只开赚钱：自动去「已解锁的工作」里挑时薪最高的来打（学段越高解锁的工作越值钱）。
//   - 只开学习：纯学习，不赚管家币。
//   - 自理：离线期间管家自动替猪进食（每 2 小时）、玩耍（每 1.5 小时）、洗澡（每 3 小时），花管家币买口粮/玩具/洗浴；
//     自理与学习/赚钱开关独立，开着自动就会做。
// 数据导出 / 导入：面板可复制「导出存档串」，换电脑或误删后可粘贴导回（只恢复学习进度与统计，钱包/开关以当前为准）。
// 注意：扩展改不了主猪的饱食/心情/清洁（api.pig 只读），主猪状态以游戏为准；这里记的是「管家替猪做了什么」的账。
export const ROUND_MS = 5 * 60 * 1000 // 一轮 = 5 分钟
export const CAP_MS = 72 * 60 * 60 * 1000 // 单次结算最多补 72 小时
export const WORK_BASE = 10 // 小学：每轮赚 10 币（= 120 币/小时）
export const STUDY_PER_SUBJECT_MS = 2 * 60 * 60 * 1000 // 学完一门课要 2 小时
export const FEED_EVERY = 24 // 每 24 轮（2 小时）进食一次
export const FEED_COST = 20
export const BATHE_EVERY = 36 // 每 36 轮（3 小时）洗澡一次
export const BATHE_COST = 15
export const PLAY_EVERY = 18 // 每 18 轮（1.5 小时）玩耍一次
export const PLAY_COST = 10
/** 学无止境每轮的效率加成（±0.1/轮，不封顶，增长很缓）。 */
export const FOREVER_STEP = 0.1
export const MAX_ROUNDS = Math.floor(CAP_MS / ROUND_MS) // 864 轮

/**
 * 学段与科目：小学 → 中学 → 大学 → 研究生 → 学无止境。
 * eff 是打工效率系数（每轮赚 WORK_BASE × eff）；学无止境的 eff = 2.0 + 0.1×轮数。
 */
export const STAGES = [
  { key: 'primary', label: '小学', emoji: '🎒', eff: 1.0, subjects: [
    { key: 'chinese', label: '语文', emoji: '📖' },
    { key: 'math', label: '数学', emoji: '🔢' },
    { key: 'english', label: '英语', emoji: '🔤' },
    { key: 'science', label: '科学', emoji: '🔬' },
  ] },
  { key: 'middle', label: '中学', emoji: '🏫', eff: 1.2, subjects: [
    { key: 'chinese', label: '语文', emoji: '📖' },
    { key: 'math', label: '数学', emoji: '🔢' },
    { key: 'english', label: '英语', emoji: '🔤' },
    { key: 'physics', label: '物理', emoji: '⚛️' },
    { key: 'chemistry', label: '化学', emoji: '🧪' },
    { key: 'biology', label: '生物', emoji: '🧬' },
    { key: 'history', label: '历史', emoji: '🏛️' },
    { key: 'geography', label: '地理', emoji: '🌍' },
  ] },
  { key: 'college', label: '大学', emoji: '🎓', eff: 1.4, subjects: [
    { key: 'calculus', label: '高等数学', emoji: '🎯' },
    { key: 'physics2', label: '物理学', emoji: '⚛️' },
    { key: 'cs', label: '计算机科学', emoji: '💻' },
    { key: 'econ', label: '经济学', emoji: '💹' },
    { key: 'philosophy', label: '哲学', emoji: '🧠' },
  ] },
  { key: 'postgrad', label: '研究生', emoji: '🧑‍🔬', eff: 1.6, subjects: [
    { key: 'paper', label: '论文阅读', emoji: '📄' },
    { key: 'method', label: '研究方法', emoji: '🔬' },
    { key: 'frontier', label: '前沿研讨', emoji: '💡' },
  ] },
  { key: 'forever', label: '学无止境', emoji: '♾️', eff: 2.0, subjects: [
    { key: 'cross', label: '跨学科', emoji: '🧩' },
    { key: 'create', label: '创造学', emoji: '🎨' },
    { key: 'wisdom', label: '智慧学', emoji: '🦉' },
    { key: 'zen', label: '修身养性', emoji: '🧘' },
  ] },
]

/**
 * 工作榜：每个学段解锁一份「该学段打工」的工作（名字取自游戏 Jobs 表）。
 * 只开赚钱时自动去已解锁（stage ≤ 当前学段）的工作里挑时薪最高的一份来打；
 * 学段越高解锁的工作越值钱：10 → 12 → 14 → 16 → 20 币/轮（学无止境再按轮次 +0.1）。
 */
export const JOBS = [
  { key: 'bricks', label: '搬砖', emoji: '🧱', stage: 0 },
  { key: 'flyers', label: '发传单', emoji: '📄', stage: 0 },
  { key: 'cashier', label: '收银员', emoji: '🧾', stage: 1 },
  { key: 'courier', label: '快递员', emoji: '📦', stage: 1 },
  { key: 'chef', label: '厨师', emoji: '👨‍🍳', stage: 2 },
  { key: 'lawyer', label: '律师', emoji: '⚖️', stage: 2 },
  { key: 'programmer', label: '程序员', emoji: '💻', stage: 3 },
  { key: 'doctor', label: '医生', emoji: '🩺', stage: 3 },
  { key: 'scientist', label: '科研人员', emoji: '🔬', stage: 4 },
  { key: 'ceo', label: '总裁', emoji: '💼', stage: 4 },
]

const count = value => Math.max(0, Math.floor(Number(value) || 0))
const isOldSave = data => data && typeof data.level === 'number' && data.stage === undefined
const stageCount = () => STAGES.reduce((sum, stage) => sum + stage.subjects.length, 0) // 24

/** 当前打工效率：普通学段取 eff；学无止境每轮 +FOREVER_STEP。 */
export function effOf(state) {
  const base = STAGES[state.stage].eff
  return state.stage === STAGES.length - 1 ? base + FOREVER_STEP * state.rounds : base
}

/** 一份工作时薪（币/轮）：普通学段 = WORK_BASE × 该学段 eff；学无止境轮次越高越值钱。 */
export function jobRate(job, state) {
  return Math.round(WORK_BASE * effOf(state))
}

/** 已解锁的最高价值工作：在 stage ≤ 当前学段的所有工作里，按时薪（币/轮）取最高；同薪取更高级的学段。
 * 学段越高解锁的工作越值钱，所以结果就是当前学段的工作；当学无止境轮次涨了，同样工作时薪也跟着涨。 */
export function bestJob(state) {
  const current = Math.min(STAGES.length - 1, Math.max(0, count(state.stage)))
  let best = JOBS[0]
  for (const job of JOBS) {
    if (job.stage > current) continue
    if (job.stage > best.stage || (job.stage === best.stage && jobRate(job, state) > jobRate(best, state))) best = job
  }
  return { ...best, coinsPerRound: jobRate(best, state) }
}

/** 学完一门课：推进科目、必要时升段；学无止境里科目循环、轮数 +1。 */
function studyOne(state) {
  state.subject += 1
  state.studied += 1
  const subjects = STAGES[state.stage].subjects
  if (state.subject >= subjects.length) {
    state.subject = 0
    if (state.stage < STAGES.length - 1) state.stage += 1
    else state.rounds += 1
  }
}

/** v1.0 旧存档无损迁移：旧 level/studyMs（每级 2 小时学习）折算成总学习时长，重新推进到新学段体系。 */
export function normalize(data) {
  if (isOldSave(data)) {
    const totalMs = Math.max(0, (count(data.level) - 1) * STUDY_PER_SUBJECT_MS + count(data.studyMs))
    const old = data
    data.on = !!old.on
    data.lastAt = count(old.lastAt)
    data.stage = 0
    data.subject = 0
    data.studyMs = 0
    data.rounds = 0
    data.studied = 0
    // 把旧存档已学时长在新体系里重放一遍（最多 36 门课，几十步就跑完）
    let left = totalMs
    while (left >= STUDY_PER_SUBJECT_MS) {
      left -= STUDY_PER_SUBJECT_MS
      studyOne(data)
    }
    data.studyMs = left
    data.stats = { work: 0, feed: 0, bathe: 0, play: 0, spent: 0 }
  }
  // v1.2 及更早的存档没有独立开关：默认学习和赚钱都开（行为与之前完全一致）
  if (data.study === undefined) data.study = true
  if (data.work === undefined) data.work = true
  return data
}

/** 学过判断：每门学科学过没有——✅ done 已学过 / ▶️ learn 正在学 / ⬜ todo 还没学。
 * 顺序学习模型（升段前必须学完本段全部科目）下，直接用指针就能推导，不引入冗余数据；
 * 学无止境每轮从第 1 门重新开始，轮内同样按指针判断。 */
export function subjectStatus(data) {
  return STAGES.map((stage, si) => ({
    key: stage.key, label: stage.label, emoji: stage.emoji, eff: stage.eff,
    done: si < data.stage, // 这整个学段都毕业了
    subjects: stage.subjects.map((s, i) => ({
      key: s.key, label: s.label, emoji: s.emoji,
      status: si < data.stage ? 'done' : si > data.stage ? 'todo' : i < data.subject ? 'done' : i === data.subject ? 'learn' : 'todo',
    })),
  }))
}

/** 纯计算：从 from 到 to（毫秒）这段离线会跑多少轮、赚多少、自理几次、学到哪。不碰存档、不动钱包。
 * 学习 / 赚钱开关都读存档：study=false 就不推进学习，work=false 就不打工。 */
export function plan(data, from, to) {
  const rounds = Math.min(MAX_ROUNDS, Math.max(0, Math.floor((to - from) / ROUND_MS)))
  const doStudy = data.study !== false
  const doWork = data.work !== false
  const zero = {
    rounds: 0, work: 0, feed: 0, bathe: 0, play: 0, spent: 0,
    stage: data.stage, subject: data.subject, studyMs: data.studyMs, studied: 0, up: 0,
    studiedTotal: data.studied, roundsForever: data.rounds,
  }
  if (rounds === 0) return zero
  let work = 0
  let feed = 0
  let bathe = 0
  let play = 0
  let stage = data.stage
  let subject = data.subject
  let studyMs = data.studyMs
  let studied = 0
  let up = 0
  let roundsForever = data.rounds
  for (let i = 1; i <= rounds; i += 1) {
    if (doWork) {
      // 学无止境效率 = 2.0 + 0.1 × 轮数；普通学段取各自 eff
      const eff = stage === STAGES.length - 1 ? STAGES[stage].eff + FOREVER_STEP * roundsForever : STAGES[stage].eff
      work += Math.round(WORK_BASE * eff)
    }
    if (doStudy) {
      studyMs += ROUND_MS
      while (studyMs >= STUDY_PER_SUBJECT_MS) {
        studyMs -= STUDY_PER_SUBJECT_MS
        studied += 1
        subject += 1
        const subjects = STAGES[stage].subjects
        if (subject >= subjects.length) {
          subject = 0
          if (stage < STAGES.length - 1) { stage += 1; up += 1 }
          else roundsForever += 1
        }
      }
    }
    if (i % FEED_EVERY === 0) feed += 1
    if (i % BATHE_EVERY === 0) bathe += 1
    if (i % PLAY_EVERY === 0) play += 1
  }
  return {
    rounds, work,
    feed, bathe, play,
    spent: feed * FEED_COST + bathe * BATHE_COST + play * PLAY_COST,
    stage, subject, studyMs, studied, up, studiedTotal: data.studied + studied, roundsForever,
  }
}

/** 按 plan 的结果落账：先打工入账，再逐项付自理开销（付不起的就算了，不影响别的），更新存档。返回本次摘要。 */
function settle(data, now, api) {
  if (!data.lastAt) {
    data.lastAt = now
    return { rounds: 0, work: 0, earned: 0, spent: 0, feed: 0, bathe: 0, play: 0, studied: 0, up: 0, stage: data.stage, subject: data.subject }
  }
  const p = plan(data, data.lastAt, now)
  data.lastAt = now
  if (p.rounds === 0) {
    return { rounds: 0, work: 0, earned: 0, spent: 0, feed: 0, bathe: 0, play: 0, studied: 0, up: 0, stage: data.stage, subject: data.subject }
  }
  const hasWallet = api.wallet && typeof api.wallet.earn === 'function' && typeof api.wallet.spend === 'function'
  // 先赚后花：管家先打工挣到钱，再去买口粮/玩具/洗浴；钱包没有（老宿主）就只记账不结账。
  const earned = hasWallet ? api.wallet.earn(p.work, 'work') : 0
  let spent = 0
  let feedDone = 0
  let batheDone = 0
  let playDone = 0
  const pay = (cost, sink) => {
    if (!hasWallet || !api.wallet.spend(cost, sink)) return false
    spent += cost
    return true
  }
  for (let i = 0; i < p.feed; i += 1) if (pay(FEED_COST, 'feed')) feedDone += 1
  for (let i = 0; i < p.bathe; i += 1) if (pay(BATHE_COST, 'bathe')) batheDone += 1
  for (let i = 0; i < p.play; i += 1) if (pay(PLAY_COST, 'play')) playDone += 1
  data.stats.work += earned
  data.stats.feed += feedDone
  data.stats.bathe += batheDone
  data.stats.play += playDone
  data.stats.spent += spent
  data.stage = p.stage
  data.subject = p.subject
  data.studyMs = p.studyMs
  data.studied += p.studied
  data.rounds = p.roundsForever
  if (typeof api.say === 'function') {
    const hours = Math.round(p.rounds * ROUND_MS / 3600000 * 10) / 10
    const stage = STAGES[p.stage]
    const subjectName = stage.subjects[p.subject].label
    const learn = p.studied > 0 ? `，学完 ${p.studied} 门课` : ''
    const care = spent > 0 ? `，自理花了 ${spent} 币` : ''
    const where = p.stage === STAGES.length - 1 ? `${stage.label} 第 ${p.roundsForever} 轮` : `${stage.label}·${subjectName}`
    const job = doWork(p) ? bestJob(data) : null
    const oki = job !== null && p.work > 0 ? `，在打「${job.emoji}${job.label}」` : ''
    api.say(`离线 ${hours} 小时：打工赚了 ${earned} 币${oki}${learn}${care}，正在学 ${where}`)
  }
  return { rounds: p.rounds, work: p.work, earned, spent, feed: feedDone, bathe: batheDone, play: playDone, studied: p.studied, up: p.up, stage: p.stage, subject: p.subject }
}

/** 这一段有没有在赚钱（供台词拼接用）。 */
function doWork(p) {
  return p.work > 0
}

/** 导出存档串：只含学习进度与统计（不含钱包余额、开关、计时点）——钱包由宿主保管，导入不碰它。 */
export function exportData(data) {
  return JSON.stringify({
    format: 'pig-auto-save',
    version: 1,
    stage: data.stage,
    subject: data.subject,
    studyMs: data.studyMs,
    rounds: data.rounds,
    studied: data.studied,
    stats: { ...data.stats },
  })
}

/** 校验并恢复导入串。只认白名单字段与范围；非法输入返回 ok:false，什么都不动。 */
export function importData(data, raw) {
  let parsed = null
  try { parsed = JSON.parse(String(raw ?? '').trim()) } catch { return { ok: false, reason: 'unknown' } }
  if (parsed === null || typeof parsed !== 'object' || parsed.format !== 'pig-auto-save') return { ok: false, reason: 'unknown' }
  if (!Number.isInteger(parsed.stage) || parsed.stage < 0 || parsed.stage >= STAGES.length) return { ok: false, reason: 'unknown' }
  const stage = parsed.stage
  const subjectCount = STAGES[stage].subjects.length
  if (!Number.isInteger(parsed.subject) || parsed.subject < 0 || parsed.subject >= subjectCount) return { ok: false, reason: 'unknown' }
  const n = value => Math.max(0, Math.floor(Number(value) || 0))
  data.stage = stage
  data.subject = parsed.subject
  data.studyMs = Math.min(STUDY_PER_SUBJECT_MS - 1, n(parsed.studyMs))
  data.rounds = n(parsed.rounds)
  data.studied = n(parsed.studied)
  const stats = parsed.stats !== null && typeof parsed.stats === 'object' && !Array.isArray(parsed.stats) ? parsed.stats : {}
  data.stats = { work: n(stats.work), feed: n(stats.feed), bathe: n(stats.bathe), play: n(stats.play), spent: n(stats.spent) }
  return { ok: true }
}

export default {
  init() {
    return {
      on: false,
      study: true,
      work: true,
      lastAt: 0,
      stage: 0,
      subject: 0,
      studyMs: 0,
      rounds: 0,
      studied: 0,
      stats: { work: 0, feed: 0, bathe: 0, play: 0, spent: 0 },
    }
  },
  actions: {
    // 开/关自动；关的时候顺手把已经挂上的时间结算掉
    toggle(data, payload, api) {
      normalize(data)
      if (data.on) {
        settle(data, api.now, api)
        data.on = false
        return { ok: true, on: false }
      }
      data.on = true
      if (!data.lastAt) data.lastAt = api.now
      return { ok: true, on: true }
    },
    // 一键领取：电脑重新打开后点一下，把从 lastAt 到现在该补的离线收益入账
    claim(data, payload, api) {
      normalize(data)
      if (!data.on) return { ok: false, reason: 'unavailable' }
      const summary = settle(data, api.now, api)
      return { ok: true, ...summary }
    },
    // 学习开关：单独控制离线要不要学习
    study(data, payload, api) {
      normalize(data)
      data.study = payload && payload.on === true
      return { ok: true, study: data.study }
    },
    // 赚钱开关：单独控制离线要不要打工；只开赚钱时自动打已解锁的最高价值工作
    work(data, payload, api) {
      normalize(data)
      data.work = payload && payload.on === true
      return { ok: true, work: data.work }
    },
    // 导入存档串：从面板粘贴的导出串恢复学习进度
    import(data, payload, api) {
      normalize(data)
      const raw = payload && typeof payload.raw === 'string' ? payload.raw : ''
      const result = importData(data, raw)
      if (!result.ok) return { ok: false, reason: 'unknown' }
      // 导入后计时点重置为现在：避免把导入前的离线又补算一遍（会重复赚钱）
      data.lastAt = api.now
      return { ok: true }
    },
  },
  view(data, api) {
    normalize(data)
    // 面板数据只算不写；开着的时候预告「现在领能拿到多少」
    let pending = null
    if (data.on && data.lastAt) pending = plan(data, data.lastAt, api.now)
    const balance = api.wallet && typeof api.wallet.balance === 'function' ? api.wallet.balance() : 0
    return {
      on: data.on,
      study: data.study,
      work: data.work,
      stage: data.stage,
      subject: data.subject,
      studyMs: data.studyMs,
      studyNeed: STUDY_PER_SUBJECT_MS,
      rounds: data.rounds,
      studied: data.studied,
      stages: STAGES,
      jobs: JOBS,
      currentJob: bestJob(data),
      statuses: subjectStatus(data),
      balance,
      stats: { ...data.stats },
      pending,
      exportData: exportData(data),
    }
  },
}