type Strings = {
  appTitle: string;
  start: string;
  players3: string;
  players4: string;
  rules: string;
  back: string;
  play: string;
  pass: string;
  hint: string;
  sort: string;
  yourTurn: string;
  waiting: string;
  freeLead: string;
  lastPlay: string;
  passed: string;
  you: string;
  bot: string;
  winner: string;
  results: string;
  rematch: string;
  cardsLeft: string;
  selectCards: string;
  errStraightRank: string;
  errStraightMin: string;
  errMismatch: string;
  errTooSmall: string;
  errNotYourTurn: string;
  errNoPass: string;
  langToggle: string;
  placeN: (n: number) => string;
  soloMode: string;
  onlineMode: string;
  createRoom: string;
  joinRoom: string;
  yourName: string;
  roomCode: string;
  enterRoom: string;
  ready: string;
  notReady: string;
  startGame: string;
  waitingHost: string;
  points: string;
  fillBots: string;
  noShuffle: string;
  noShuffleDesc: string;
  copyCode: string;
  copied: string;
  leaveRoom: string;
  connecting: string;
  reconnecting: string;
  botShort: string;
};

export const STRINGS: Record<'zh' | 'en', Strings> = {
  zh: {
    appTitle: '干瞪眼',
    start: '开始游戏',
    players3: '3人局',
    players4: '4人局',
    rules: '规则',
    back: '返回',
    play: '出牌',
    pass: '过',
    hint: '提示',
    sort: '整理',
    yourTurn: '轮到你出牌',
    waiting: '等待对手',
    freeLead: '自由领出',
    lastPlay: '上一手',
    passed: '已过',
    you: '你',
    bot: '机器人',
    winner: '获胜者',
    results: '结算',
    rematch: '再来一局',
    cardsLeft: '张',
    selectCards: '请先选牌',
    errStraightRank: '2、3和大小王不能进顺子',
    errStraightMin: '三人局顺子至少4张',
    errMismatch: '需要相同牌型和张数',
    errTooSmall: '所选牌不够大',
    errNotYourTurn: '还没轮到你',
    errNoPass: '自由领出不能过牌',
    langToggle: 'EN',
    placeN: (n: number) => `第${n}名`,
    soloMode: '单机对战',
    onlineMode: '联机对战',
    createRoom: '创建房间',
    joinRoom: '加入房间',
    yourName: '你的名字',
    roomCode: '房间号',
    enterRoom: '进入',
    ready: '准备',
    notReady: '取消准备',
    startGame: '开始游戏',
    waitingHost: '等待房主开始…',
    points: '分',
    fillBots: '空位由机器人补齐',
    noShuffle: '不洗牌',
    noShuffleDesc: '炸弹满天飞',
    copyCode: '复制房间号',
    copied: '已复制！',
    leaveRoom: '离开房间',
    connecting: '连接中…',
    reconnecting: '重连中…',
    botShort: '机',
  },
  en: {
    appTitle: 'Gandengyan',
    start: 'Start Game',
    players3: '3 Players',
    players4: '4 Players',
    rules: 'Rules',
    back: 'Back',
    play: 'Play',
    pass: 'Pass',
    hint: 'Hint',
    sort: 'Sort',
    yourTurn: 'Your turn',
    waiting: 'Waiting for opponent',
    freeLead: 'Free lead',
    lastPlay: 'Last play',
    passed: 'Passed',
    you: 'You',
    bot: 'Bot',
    winner: 'Winner',
    results: 'Results',
    rematch: 'Rematch',
    cardsLeft: 'cards',
    selectCards: 'Select cards first',
    errStraightRank: '2, 3 and Jokers cannot be in straights',
    errStraightMin: '3-player straights need at least 4 cards',
    errMismatch: 'Need same type and card count',
    errTooSmall: 'Selection is not big enough',
    errNotYourTurn: 'Not your turn',
    errNoPass: 'Cannot pass on a free lead',
    langToggle: '中文',
    placeN: (n: number) => `#${n}`,
    soloMode: 'Solo vs Bots',
    onlineMode: 'Online Multiplayer',
    createRoom: 'Create Room',
    joinRoom: 'Join Room',
    yourName: 'Your name',
    roomCode: 'Room code',
    enterRoom: 'Join',
    ready: 'Ready',
    notReady: 'Unready',
    startGame: 'Start Game',
    waitingHost: 'Waiting for host…',
    points: ' pts',
    fillBots: 'Fill empty seats with bots',
    noShuffle: 'No-shuffle',
    noShuffleDesc: 'bombs everywhere',
    copyCode: 'Copy code',
    copied: 'Copied!',
    leaveRoom: 'Leave room',
    connecting: 'Connecting…',
    reconnecting: 'Reconnecting…',
    botShort: 'B',
  },
};