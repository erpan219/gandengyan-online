'use strict';
/* i18n.js — zh/en UI strings. */

const I18N = {
  zh: {
    title: '干瞪眼',
    subtitle: '和朋友在线联机 · 无需注册',
    h_name: '你的昵称',
    h_mode: '玩法',
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
    o_base: '底分',
    b_practice: '单机练习',
    b_practice_d: 'AI 陪打,先熟悉一下',
    b_create: '创建房间',
    b_create_d: '拿到房间码发给朋友',
    h_join: '加入朋友的房间',
    ph_code: '输入房间码',
    b_join: '加入',
    connecting: '连接中…',
    diag_btn: '联机不上?点此网络诊断',
    diag_running: '诊断中,约需 10 秒…',
    diag_broker: '信令服务器(建房/找房)',
    diag_stun: 'NAT 穿透(STUN)',
    diag_turn: '中继服务器(TURN)',
    diag_v_good: '✔ 网络条件良好,联机应该没问题',
    diag_v_noturn: '⚠ 无中继服务器:家用网络间一般能连,但校园网/公司网(设备隔离)会连不上。解决办法见 GitHub README 的 TURN 配置说明',
    diag_v_blocked: '✖ 当前网络严重受限(UDP 被封),需要配置 TURN 中继才可联机',
    diag_v_broker: '✖ 无法连接信令服务器,请检查网络或换网络重试',
    b_help: '玩法说明',
    exit_confirm: '确定要退出吗?当前对局将结束。',
    exit_confirm_online: '确定要退出吗?AI 将接管你的位置。',
    tt_bgm: '背景音乐',
    tt_snd: '音效',
    r_code: '房间码',
    b_copy: '复制',
    copied: '已复制',
    r_waiting: '等待朋友加入…',
    r_players: '玩家',
    b_start: '开始游戏',
    b_leave: '离开',
    r_ai: 'AI 补位',
    r_host: '房主',
    g_landlord: '地主',
    g_ally: '地主队友',
    g_farmer: '农民',
    lord_banner: '{0} 成为地主!',
    g_bottom: '底牌',
    g_laizi: '癞子',
    g_mult: '倍数',
    g_round: '第 {0} 局',
    g_dead: '二人场:17 张牌不入局',
    bid0: '不叫',
    bidN: '{0} 分',
    dblY: '加倍',
    dblN: '不加倍',
    b_play: '出牌',
    b_pass: '不出',
    cant_beat: '要不起',
    b_hint: '提示',
    lead_any: '轮到你了,任意出牌',
    your_turn: '轮到你了',
    thinking: '{0} 思考中…',
    pass_txt: '不出',
    autoplay_on: '超时，已进入自动托管',
    autoplay_off: '已取消托管，轮到您出牌',
    autoplay_active: '托管中...',
    cancel_autoplay: '取消托管',
    c_single: '单张', c_pair: '对子', c_trio: '三条', c_trio_single: '三带一',
    c_trio_pair: '三带二', c_straight: '顺子', c_pair_straight: '连对',
    c_plane: '飞机', c_plane_single: '飞机带单', c_plane_pair: '飞机带对',
    c_four_two: '四带二', c_four_two_pairs: '四带两对',
    c_bomb: '炸弹', c_soft: '软炸', c_laizi_bomb: '癞子炸', c_rocket: '王炸',
    s_lwin: '地主胜利!',
    s_fwin: '农民胜利!',
    s_youwin: '你赢了 🎉',
    s_youlose: '你输了 😵',
    s_spring: '春天 ×2',
    s_anti: '反春 ×2',
    s_bombs: '炸弹 ×{0}',
    s_base: '底分 {0}',
    s_bid: '叫分 {0}',
    s_total: '总倍数 ×{0}',
    s_place: '第 {0} 名',
    b_again: '再来一局',
    b_home: '返回大厅',
    e_invalid: '不符合规则,换个出法',
    e_room404: '房间不存在,检查一下房间码',
    e_conn: '连接失败,请重试',
    e_timeout: '连接超时:请勿在微信内置浏览器打开,双方换用浏览器或切换网络(如 4G/5G)再试',
    e_net: '联机服务初始化失败(单机练习不受影响)',
    e_full: '房间已满或游戏已开始',
    e_disconnected: '{0} 掉线,已由 AI 接管',
    e_hostleft: '房主已离开,房间关闭',
    e_left: '{0} 离开了房间',
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
<h3>🔀 不洗牌模式</h3>
<p>发牌前只做几次随机交换,同点数扎堆,炸弹满天飞!</p>
<h3>🌐 联机</h3>
<p>创建房间后把 4 位房间码发给朋友,对方输入即可加入。人数不足时空位由 AI 补齐;中途掉线由 AI 接管,重连可夺回。</p>`,
  },
  en: {
    title: 'Gandengyan',
    subtitle: 'Play with friends online · no signup',
    h_name: 'Your nickname',
    h_mode: 'Game mode',
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
    o_base: 'Base stake',
    b_practice: 'Practice vs AI',
    b_practice_d: 'Warm up against bots',
    b_create: 'Create room',
    b_create_d: 'Get a code, send it to a friend',
    h_join: "Join a friend's room",
    ph_code: 'Enter room code',
    b_join: 'Join',
    connecting: 'Connecting…',
    diag_btn: "Can't connect? Run network test",
    diag_running: 'Testing, ~10 seconds…',
    diag_broker: 'Signaling broker (room setup)',
    diag_stun: 'NAT traversal (STUN)',
    diag_turn: 'Relay server (TURN)',
    diag_v_good: '✔ Network looks good — online play should work',
    diag_v_noturn: '⚠ No relay: home networks usually connect, but campus/office WiFi (client isolation) will fail. See the TURN setup notes in the GitHub README',
    diag_v_blocked: '✖ This network blocks peer traffic (UDP) — a TURN relay is required',
    diag_v_broker: '✖ Cannot reach the signaling broker — check your connection or switch networks',
    b_help: 'How to play',
    exit_confirm: 'Exit the game? Current match will end.',
    exit_confirm_online: 'Exit the game? AI will take over your seat.',
    tt_bgm: 'Background music',
    tt_snd: 'Sound effects',
    r_code: 'Room code',
    b_copy: 'Copy',
    copied: 'Copied',
    r_waiting: 'Waiting for your friend…',
    r_players: 'Players',
    b_start: 'Start game',
    b_leave: 'Leave',
    r_ai: 'AI seat',
    r_host: 'Host',
    g_landlord: 'Landlord',
    g_ally: 'Landlord ally',
    g_farmer: 'Farmer',
    lord_banner: '{0} is the landlord!',
    g_bottom: 'Kitty',
    g_laizi: 'Wild',
    g_mult: 'Multiplier',
    g_round: 'Round {0}',
    g_dead: 'Duel: 17 cards out of play',
    bid0: 'Pass',
    bidN: 'Bid {0}',
    dblY: 'Double',
    dblN: 'No double',
    b_play: 'Play',
    b_pass: 'Pass',
    cant_beat: "Can't beat it",
    b_hint: 'Hint',
    lead_any: 'Your lead — play anything',
    your_turn: 'Your turn',
    thinking: '{0} is thinking…',
    pass_txt: 'Pass',
    autoplay_on: 'Timeout, auto-play enabled',
    autoplay_off: 'Auto-play cancelled, your turn',
    autoplay_active: 'Auto-playing...',
    cancel_autoplay: 'Cancel Auto-Play',
    c_single: 'Single', c_pair: 'Pair', c_trio: 'Trio', c_trio_single: 'Trio + 1',
    c_trio_pair: 'Trio + pair', c_straight: 'Straight', c_pair_straight: 'Pair straight',
    c_plane: 'Plane', c_plane_single: 'Plane + singles', c_plane_pair: 'Plane + pairs',
    c_four_two: 'Four + 2', c_four_two_pairs: 'Four + 2 pairs',
    c_bomb: 'Bomb', c_soft: 'Soft bomb', c_laizi_bomb: 'Wild bomb', c_rocket: 'Rocket',
    s_lwin: 'Landlord wins!',
    s_fwin: 'Farmers win!',
    s_youwin: 'You win 🎉',
    s_youlose: 'You lose 😵',
    s_spring: 'Spring ×2',
    s_anti: 'Anti-spring ×2',
    s_bombs: 'Bombs ×{0}',
    s_base: 'Base {0}',
    s_bid: 'Bid {0}',
    s_total: 'Total ×{0}',
    s_place: '第 {0} 名',
    s_place: 'Place {0}',
    b_again: 'Play again',
    b_home: 'Back to lobby',
    e_invalid: "That doesn't work — try another play",
    e_room404: 'Room not found — check the code',
    e_conn: 'Connection failed, please retry',
    e_timeout: 'Connection timed out — avoid in-app browsers (e.g. WeChat) and try another network (4G/5G)',
    e_net: 'Online service unavailable (practice mode still works)',
    e_full: 'Room is full or the game already started',
    e_disconnected: '{0} disconnected — an AI took over',
    e_hostleft: 'The host left; room closed',
    e_left: '{0} left the room',
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
<h3>🔀 No-shuffle</h3>
<p>Deck gets only a few swaps — ranks clump together, bombs everywhere!</p>
<h3>🌐 Online</h3>
<p>Create a room, share the 4-letter code. Empty seats filled by AI; disconnects are taken over by AI, reconnect to reclaim.</p>`,
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
