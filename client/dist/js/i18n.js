'use strict';
/* i18n.js — zh/en UI strings. */

const I18N = {
  zh: {
    title: '干瞪眼',
    subtitle: '和朋友在线联机 · 无需注册',
    h_name: '你的昵称',
    h_mode: '玩法',
    m_3p: '3人局',
    m_3p_d: '18张/人',
    m_4p: '4人局',
    m_4p_d: '14/14/13/13',
    m_classic: '经典三人',
    m_classic_d: '1–3 人联机,空位由 AI 补',
    m_duel: '二人对决',
    m_duel_d: '1v1,17 张废牌不入局',
    m_team: '四人 2v2',
    m_team_d: '对家组队,每人 13 张',
    h_options: '房间选项',
    o_laizi: '癞子场',
    o_laizi_d: '每局随机一种牌当万能牌',
    o_noshuffle: '不洗牌',
    o_noshuffle_d: '疯狂模式,炸弹满天飞',
    o_doubling: '加倍阶段',
    o_doubling_d: '定地主后可选加倍',
    b_practice: '单机练习',
    b_practice_d: 'AI 陪打,先熟悉一下',
    b_create: '创建房间',
    b_create_d: '拿到房间码发给朋友',
    h_join: '加入朋友的房间',
    ph_code: '输入房间码',
    b_join: '加入',
    connecting: '连接中…',
    b_help: '玩法说明',
    exit_confirm: '确定要退出吗?当前对局将结束。',
    exit_confirm_online: '确定要退出吗?AI 将接管你的位置。',
    tt_bgm: '背景音乐',
    tt_snd: '音效',
    a11y_close: '关闭',
    a11y_exit: '退出对局',
    a11y_chat: '聊天',
    r_code: '房间码',
    b_copy: '复制',
    copied: '已复制',
    r_waiting: '等待朋友加入…',
    b_start: '开始游戏',
    b_leave: '离开',
    r_host: '房主',
    g_laizi: '癞子',
    g_mult: '倍数',
    g_round: '第 {0} 局',
    g_dead: '二人场:17 张牌不入局',
    b_play: '出牌',
    b_pass: '不出',
    cant_beat: '要不起',
    b_hint: '提示',
    lead_any: '轮到你了,任意出牌',
    thinking: '{0} 思考中…',
    pass_txt: '不出',
    autoplay_on: '超时，已进入自动托管',
    autoplay_off: '已取消托管，轮到您出牌',
    autoplay_active: '托管中...',
    cancel_autoplay: '取消托管',
    take_tempo: '抢节奏，让对手应对',
    efficient_dump: '高效出牌，减少手牌',
    save_high: '保留大牌作收尾',
    breaks_bomb: '注意：会拆散炸弹',
    block_win: '对手快赢了，必须拦截',
    endgame_push: '残局推进，争取收尾',
    save_bomb: '保留炸弹，等待时机',
    dump_low: '甩掉小牌，安全',
    wasteful_warn: '用大牌打小牌，有点浪费',
    safe_play: '稳妥出牌，保护关键牌',
    hint_best: '最佳',
    hint_good: '不错',
    hint_safe: '稳妥',
    you_win: '你赢了！',
    round_end: '本轮结束',
    c_single: '单张', c_pair: '对子', c_trio: '三条', c_trio_single: '三带一',
    c_bomb: '炸弹', c_soft: '软炸', c_laizi_bomb: '癞子炸', c_rocket: '王炸',
    c_triplebomb: '三张炸弹', c_fourbomb: '四张炸弹',
    reason_invalid_combo: '无效组合',
    reason_no_beat: '打不过上一手',
    s_youwin: '你赢了 🎉',
    s_youlose: '你输了 😵',
    s_place: '第 {0} 名',
    b_again: '再来一局',
    b_home: '返回大厅',
    e_invalid: '不符合规则,换个出法',
    e_room404: '房间不存在,检查一下房间码',
    e_net: '联机服务初始化失败(单机练习不受影响)',
    e_redeal: '无人叫地主,重新发牌',
    jk_small: '小王', jk_big: '大王',
    ai_tag: 'AI',
    cards_left: '剩 {0} 张',
    score_pts: '{0} 分',
    chat: ['快点啦～', '大的来了!', '炸得漂亮!', '这牌没法打', '再来一局,决战到天亮', '哈哈哈哈', '佩服佩服', '你是 AI 吗?'],
    help_title: '玩法说明',
    help_body: `
<h3>🃏 基本规则</h3>
<p>干瞪眼:3–4 人,共 54 张牌。三人局每人 18 张;四人局 14/14/13/13。逆时针出牌,先出完者胜,按名次计分。</p>
<h3>🎯 首出规则</h3>
<p>第一局:手中有黑桃 4 者先出(不必打出黑桃 4)。之后每局:上一局第一名先出。</p>
<h3>📊 牌力大小</h3>
<p>4 &lt; 5 &lt; 6 &lt; 7 &lt; 8 &lt; 9 &lt; 10 &lt; J &lt; Q &lt; K &lt; A &lt; 2 &lt; 3 &lt; 小王 &lt; 大王</p>
<h3>💣 炸弹</h3>
<p>三张同点为三炸,四张同点为四炸,小王+大王为火箭(最大)。炸弹大小:火箭 &gt; 四炸 &gt; 三炸 &gt; 普通牌。炸弹可压任何非炸弹牌型。</p>
<h3>🂡 牌型</h3>
<p>单张、对子、顺子(4–A,三人局≥4 张/四人局≥3 张)、连对(4–A,≥2 对)。无三带、飞机、癞子。</p>
<h3>⏭️ 出牌规则</h3>
<p>跟牌时可"过",自由领出时必须出牌。普通牌需同牌型同张数且更大;炸弹可随时打出。</p>
<h3>🏆 计分</h3>
<p>三人局:第 1/2/3 名得 2/1/0 分;四人局:第 1/2/3/4 名得 3/2/1/0 分。多局累计。</p>
<p>炸弹加分:每个炸弹+1,王炸+2。可与名次分叠加。</p>
<h3>🔀 不洗牌模式</h3>
<p>发牌前只做几次随机交换,同点数扎堆,炸弹满天飞!</p>
<h3>🌐 联机</h3>
<p>创建房间后把 6 位房间码发给朋友,对方输入即可加入。人数不足时空位由 AI 补齐;中途掉线由 AI 接管,重连可夺回。</p>`,
  },
  en: {
    title: 'Gandengyan',
    subtitle: 'Play with friends online · no signup',
    h_name: 'Your nickname',
    h_mode: 'Game mode',
    m_3p: '3 Players',
    m_3p_d: '18 cards each',
    m_4p: '4 Players',
    m_4p_d: '14/14/13/13',
    m_classic: 'Classic (3P)',
    m_classic_d: 'For 1–3 humans — AIs fill any empty seat',
    m_duel: 'Heads-up duel',
    m_duel_d: '1v1, 17 cards set aside',
    m_team: '4P teams (2v2)',
    m_team_d: 'Partners sit opposite, 13 cards each',
    h_options: 'Room options',
    o_laizi: 'Wildcard (Laizi)',
    o_laizi_d: 'One random rank is wild each round',
    o_noshuffle: 'No-shuffle',
    o_noshuffle_d: 'Crazy mode — bombs everywhere',
    o_doubling: 'Doubling phase',
    o_doubling_d: 'Optional ×2 after the landlord is set',
    b_practice: 'Practice vs AI',
    b_practice_d: 'Warm up against bots',
    b_create: 'Create room',
    b_create_d: 'Get a code, send it to a friend',
    h_join: "Join a friend's room",
    ph_code: 'Enter room code',
    b_join: 'Join',
    connecting: 'Connecting…',
    b_help: 'How to play',
    exit_confirm: 'Exit the game? Current match will end.',
    exit_confirm_online: 'Exit the game? AI will take over your seat.',
    tt_bgm: 'Background music',
    tt_snd: 'Sound effects',
    a11y_close: 'Close',
    a11y_exit: 'Exit game',
    a11y_chat: 'Chat',
    r_code: 'Room code',
    b_copy: 'Copy',
    copied: 'Copied',
    r_waiting: 'Waiting for your friend…',
    b_start: 'Start game',
    b_leave: 'Leave',
    r_host: 'Host',
    g_laizi: 'Wild',
    g_mult: 'Multiplier',
    g_round: 'Round {0}',
    g_dead: 'Duel: 17 cards out of play',
    b_play: 'Play',
    b_pass: 'Pass',
    cant_beat: "Can't beat it",
    b_hint: 'Hint',
    lead_any: 'Your lead — play anything',
    thinking: '{0} is thinking…',
    pass_txt: 'Pass',
    autoplay_on: 'Timeout, auto-play enabled',
    autoplay_off: 'Auto-play cancelled, your turn',
    autoplay_active: 'Auto-playing...',
    cancel_autoplay: 'Cancel Auto-Play',
    take_tempo: 'Take tempo, force reaction',
    efficient_dump: 'Efficient dump, fewer cards',
    save_high: 'Save high cards for finish',
    breaks_bomb: 'Warning: breaks a bomb',
    block_win: 'Opponent almost out, must block',
    endgame_push: 'Endgame push for the win',
    save_bomb: 'Save bomb for the right moment',
    dump_low: 'Dump low cards safely',
    wasteful_warn: 'Big card on small play, wasteful',
    safe_play: 'Safe play, protect key cards',
    hint_best: 'Best',
    hint_good: 'Good',
    hint_safe: 'Safe',
    you_win: 'You Win!',
    round_end: 'Round ended',
    c_single: 'Single', c_pair: 'Pair', c_trio: 'Trio', c_trio_single: 'Trio + 1',
    c_bomb: 'Bomb', c_soft: 'Soft bomb', c_laizi_bomb: 'Wild bomb', c_rocket: 'Rocket',
    c_triplebomb: 'Triple bomb', c_fourbomb: 'Four bomb',
    reason_invalid_combo: 'Invalid combination',
    reason_no_beat: 'Does not beat the previous play',
    s_youwin: 'You win 🎉',
    s_youlose: 'You lose 😵',
    s_place: '第 {0} 名',
    s_place: 'Place {0}',
    b_again: 'Play again',
    b_home: 'Back to lobby',
    e_invalid: "That doesn't work — try another play",
    e_room404: 'Room not found — check the code',
    e_net: 'Online service unavailable (practice mode still works)',
    e_redeal: 'Nobody bid — redealing',
    jk_small: 'joker', jk_big: 'JOKER',
    ai_tag: 'AI',
    cards_left: '{0} left',
    score_pts: '{0} pts',
    chat: ['Hurry up~', 'Big one coming!', 'Nice bomb!', 'My hand is hopeless', 'One more, all night long!', 'Hahaha', 'Respect!', 'Are you a bot?'],
    help_title: 'How to play',
    help_body: `
<h3>🃏 Basics</h3>
<p>Gandengyan: 3–4 players, 54 cards. 3P: 18 each; 4P: 14/14/13/13. Counterclockwise, first to empty hand wins, scored by placement.</p>
<h3>🎯 Leading</h3>
<p>First hand: holder of ♠4 leads (need not play it). Later hands: previous winner leads.</p>
<h3>📊 Rank order</h3>
<p>4 &lt; 5 &lt; 6 &lt; 7 &lt; 8 &lt; 9 &lt; 10 &lt; J &lt; Q &lt; K &lt; A &lt; 2 &lt; 3 &lt; SJ &lt; BJ</p>
<h3>💣 Bombs</h3>
<p>Three of a kind = triple bomb, four = four bomb, SJ+BJ = rocket (highest). Rocket &gt; four bomb &gt; triple bomb &gt; ordinary. Bombs beat anything except higher bombs.</p>
<h3>🂡 Combos</h3>
<p>Single, pair, straight (4–A, 3P: 4+ cards / 4P: 3+ cards), pair run (4–A, 2+ pairs). No trios with kickers, no wildcards.</p>
<h3>⏭️ Play rules</h3>
<p>Pass allowed when responding; must play on free lead. Ordinary plays need same type, same count, strictly higher. Bombs can be played anytime.</p>
<h3>🏆 Scoring</h3>
<p>3P: 1st/2nd/3rd = 2/1/0 pts; 4P: 1st/2nd/3rd/4th = 3/2/1/0 pts. Cumulative across hands.</p>
<p>Bomb bonuses: Each bomb +1, Rocket +2. Bonuses stack with placement points.</p>
<h3>🔀 No-shuffle</h3>
<p>Deck gets only a few swaps — ranks clump together, bombs everywhere!</p>
<h3>🌐 Online</h3>
<p>Create a room, share the 6-character code. Empty seats filled by AI; disconnects are taken over by AI, reconnect to reclaim.</p>`,
  },
};

let LANG = 'zh';
function t(k, ...a) {
  let s = I18N[LANG][k];
  if (s === undefined) s = I18N.zh[k];
  if (s === undefined) return k;
  if (typeof s === 'string') s = s.replace(/\{(\d)\}/g, (_, i) => a[+i]);
  return s;
}
function setLang(l) {
  LANG = I18N[l] ? l : 'zh';
  try { localStorage.setItem('ddz_lang', LANG); } catch (e) { }
}
