// AI生成
;(function () {
  'use strict'
  window.dshPiggyExtensions.register('pig-auto', {
    render(app) {
      const data = app.data
      if (data === null) return // 宿主还没给 view 数据，先不画
      if (typeof document === 'undefined') return // 测试环境没有 DOM 就跳过

      let style = document.getElementById('dsh-piggy-pig-auto-style')
      if (!style) {
        style = document.createElement('style')
        style.id = 'dsh-piggy-pig-auto-style'
        style.textContent = [
          '.pg-card { background: var(--ac-panel, #ffffff); border: 1px solid var(--ac-line, #e8e8e8); border-radius: 10px; padding: 10px; }',
          '.pg-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 13px; color: var(--ac-text, #333333); }',
          '.pg-row + .pg-row { margin-top: 7px; }',
          '.pg-num { font-weight: 700; color: var(--ac-strong, #111111); white-space: nowrap; }',
          '.pg-path { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
          '.pg-dim { font-size: 11px; color: var(--ac-dim, #999999); }',
          '.pg-btns { display: flex; gap: 8px; margin-top: 10px; }',
          '.pg-sw { display: flex; gap: 8px; margin-top: 8px; }',
          '.pg-chips { flex-wrap: wrap; display: flex; gap: 3px 10px; font-size: 12px; }',
          '.pg-btns .dp-btn { flex: 1; }',
          '.pg-sw .dp-btn { flex: 1; font-size: 12px; }',
          '.pg-tip { font-size: 11px; color: var(--ac-dim, #999999); margin-top: 8px; line-height: 1.5; }',
          '.pg-box { margin-top: 8px; border-top: 1px dashed var(--ac-line, #e8e8e8); padding-top: 8px; }',
          '.pg-box .dp-btn { width: 100%; margin-top: 6px; font-size: 12px; }',
          '.pg-in { width: 100%; box-sizing: border-box; min-height: 46px; font-size: 11px; margin-top: 6px; border: 1px solid var(--ac-line, #e8e8e8); border-radius: 6px; padding: 4px 6px; color: var(--ac-text, #333333); background: var(--ac-panel, #ffffff); }',
        ].join('\n')
        document.head.appendChild(style)
      }

      const el = app.el
      const content = app.content
      // 不清空整个内容区：宿主在面板模式画了「‹ 返回」栏（appHeader），清空会把它擦掉。
      // 只移除自己上一次画的根节点（面板每 4 秒轮询重画，防止重复堆叠）。
      const prev = document.getElementById('dsh-piggy-pig-auto-root')
      if (prev) prev.remove()
      const wrap = el('div', 'pg-card')
      wrap.id = 'dsh-piggy-pig-auto-root'

      // 桌面大界面（小窗口）模式：宿主不画返回栏，扩展自己画「‹ 返回」
      if (app.mode === 'big' && typeof app.closeBig === 'function') {
        const bar = el('div', 'pg-row')
        const back = el('button', 'dp-btn dp-mini', '‹ 返回')
        back.addEventListener('click', () => { app.closeBig() })
        bar.append(back)
        wrap.append(bar)
      }


      const on = data.on === true
      const study = data.study !== false
      const work = data.work !== false
      const stage = data.stages[data.stage]
      const subject = (stage.subjects[data.subject] || stage.subjects[0])
      const pending = data.pending && data.pending.rounds > 0 ? data.pending : null
      const ROUND_MS = 5 * 60 * 1000
      const job = data.currentJob || null

      // 状态 + 余额
      const status = el('div', 'pg-row')
      status.append(el('span', '', on ? '🟢 自动中' : '⚪ 已暂停'))
      status.append(el('span', 'pg-num', '💰 ' + data.balance + ' 币'))
      wrap.append(status)

      // 学段路径：🎒小学 → 🏫中学 → 🎓大学 → 🧑‍🔬研究生 → ♾️学无止境
      const path = el('div', 'pg-row pg-path')
      const pathText = data.stages.map((s, i) => (i <= data.stage ? s.emoji + s.label : s.emoji)).join(' → ')
      path.append(el('span', '', '📚 ' + pathText))
      wrap.append(path)

      // 当前科目与进度（只开赚钱时不显示学习进度）
      if (study) {
        const cur = el('div', 'pg-row')
        if (data.stage === data.stages.length - 1) {
          cur.append(el('span', '', subject.emoji + ' ' + subject.label + '（学无止境 第 ' + data.rounds + ' 轮）'))
        } else {
          cur.append(el('span', '', stage.emoji + ' · ' + subject.emoji + ' ' + subject.label + ' 第 ' + (data.subject + 1) + '/' + stage.subjects.length + ' 门'))
        }
        cur.append(el('span', 'pg-num', pct(data.studyMs, data.studyNeed) + '%'))
        wrap.append(cur)
      }

      // 当前工作：只开赚钱/兼顾时显示在打什么工
      if (work && job) {
        const jobRow = el('div', 'pg-row')
        const jobText = data.stage === data.stages.length - 1
          ? job.emoji + ' ' + job.label + '（' + job.coinsPerRound + ' 币/轮）'
          : job.emoji + ' ' + job.label + '（' + job.coinsPerRound + ' 币/轮）'
        jobRow.append(el('span', '', '💼 ' + jobText))
        wrap.append(jobRow)
      }

      // 学习/赚钱两个独立开关
      const sw = el('div', 'pg-sw')
      const studyBtn = el('button', 'dp-btn' + (study ? ' dp-btn-on' : ''), study ? '📚 学习开' : '📚 学习关')
      studyBtn.addEventListener('click', () => { app.send('study', { on: !study }) })
      const workBtn = el('button', 'dp-btn' + (work ? ' dp-btn-on' : ''), work ? '💰 赚钱开' : '💰 赚钱关')
      workBtn.addEventListener('click', () => { app.send('work', { on: !work }) })
      sw.append(studyBtn)
      sw.append(workBtn)
      wrap.append(sw)

      // 学过判断：已毕业学段整段 ✅，当前学段逐门标 已学/在学/未学
      if (study) {
        const statuses = Array.isArray(data.statuses) ? data.statuses : []
        const graduated = statuses.filter(s => s.done)
        if (graduated.length > 0) {
          const g = el('div', 'pg-row pg-path')
          g.append(el('span', '', graduated.map(s => s.emoji + s.label).join(' ') + ' ✅ 已毕业'))
          wrap.append(g)
        }
        if (statuses[data.stage]) {
          const chips = el('div', 'pg-row pg-chips')
          chips.append(el('span', '', statuses[data.stage].emoji + ' '))
          chips.append(el('span', '', statuses[data.stage].subjects.map(s =>
            (s.status === 'done' ? '✅' : s.status === 'learn' ? '▶️' : '⬜') + s.label
          ).join('  ')))
          wrap.append(chips)
        }
      }

      // 待领卡：电脑重新打开后来这里一键领
      if (pending) {
        const net = pending.work - pending.spent
        const row1 = el('div', 'pg-row')
        row1.append(el('span', '', '⏳ 离线 ' + fmt(pending.rounds * ROUND_MS)))
        row1.append(el('span', 'pg-num', '可领 ' + net + ' 币'))
        wrap.append(row1)

        const bits = []
        if (pending.studied > 0) bits.push('学完 ' + pending.studied + ' 门课')
        if (pending.up > 0) bits.push('升入「' + data.stages[pending.stage].label + '」')
        if (pending.work > 0 && job) bits.push('打工「' + job.label + '」')
        if (bits.length > 0) {
          const rowL = el('div', 'pg-row')
          rowL.append(el('span', '', '🎮 离线成果'))
          rowL.append(el('span', 'pg-num', bits.join(' · ')))
          wrap.append(rowL)
        }

        const care = []
        if (pending.feed > 0) care.push('🍚×' + pending.feed)
        if (pending.bathe > 0) care.push('🛁×' + pending.bathe)
        if (pending.play > 0) care.push('🎾×' + pending.play)
        if (care.length > 0) {
          const row2 = el('div', 'pg-row')
          row2.append(el('span', '', '🛎️ 管家自理'))
          row2.append(el('span', 'pg-num', care.join(' ')))
          wrap.append(row2)
        }
      } else if (on && study) {
        const row0 = el('div', 'pg-row')
        row0.append(el('span', '', '📚 正在学「' + subject.label + '」…'))
        row0.append(el('span', 'pg-num', '还需 ' + fmt(Math.max(0, data.studyNeed - data.studyMs))))
        wrap.append(row0)
      }

      // 按钮：一键领取 + 开关
      const btns = el('div', 'pg-btns')
      const claimBtn = el('button', 'dp-btn', '一键领取')
      claimBtn.disabled = !on || !pending
      claimBtn.addEventListener('click', () => { app.send('claim', {}) })
      const toggleBtn = el('button', 'dp-btn', on ? '暂停自动' : '开启自动')
      toggleBtn.addEventListener('click', () => { app.send('toggle', {}) })
      if (pending) btns.append(claimBtn)
      btns.append(toggleBtn)
      wrap.append(btns)

      const tip = el('div', 'pg-tip', '离线最多补 72 小时。学习/赚钱可分开开关：只开赚钱会去做已解锁的最高价值工作，只开学习就专心学习。主猪的饱食/心情/清洁以游戏里为准。')
      wrap.append(tip)

      // 数据导出 / 导入
      const box = el('div', 'pg-box')
      const expBtn = el('button', 'dp-btn', '📤 复制导出存档')
      const importBtn = el('button', 'dp-btn', '📥 导入存档')
      box.append(expBtn)
      box.append(importBtn)
      const out = el('textarea', 'pg-in')
      out.placeholder = '导出码显示在这里，点复制后保存好'
      out.readOnly = true
      out.hidden = true
      box.append(out)
      const inp = el('textarea', 'pg-in')
      inp.placeholder = '把导出码粘贴到这里，再点「导入存档」'
      inp.hidden = true
      box.append(inp)
      expBtn.addEventListener('click', () => {
        inp.hidden = true
        if (out.hidden) {
          out.value = data.exportData || ''
          out.hidden = false
        } else {
          out.select()
          try { document.execCommand('copy') } catch (e) { /* 旧浏览器忽略 */ }
          expBtn.textContent = '✅ 已复制'
          setTimeout(() => { expBtn.textContent = '📤 复制导出存档' }, 1200)
        }
      })
      importBtn.addEventListener('click', () => {
        out.hidden = true
        if (inp.hidden) {
          inp.hidden = false
        } else {
          const raw = (inp.value || '').trim()
          if (!raw) return
          app.send('import', { raw })
          inp.value = ''
          inp.hidden = true
          importBtn.textContent = '✅ 已发送'
          setTimeout(() => { importBtn.textContent = '📥 导入存档' }, 1200)
        }
      })
      wrap.append(box)

      content.append(wrap)
    },
  })

  /** 时长转「x.x 小时 / x 分钟」。 */
  function fmt(ms) {
    const hours = ms / 3600000
    if (hours >= 1) return hours % 1 === 0 ? hours + ' 小时' : Math.round(hours * 10) / 10 + ' 小时'
    return Math.round(ms / 60000) + ' 分钟'
  }
  /** 进度百分比（0~100）。 */
  function pct(got, need) {
    if (!need) return 100
    const v = Math.floor((got / need) * 100)
    return Math.max(0, Math.min(100, v))
  }
})()