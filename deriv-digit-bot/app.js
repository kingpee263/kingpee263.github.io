/**
 * DERIV QUANT — Digit Statistics & Real-Time Trading Terminal
 * Official Deriv WebSocket v3 API Integration
 * Supports:
 * - Official Deriv OAuth2 Login (Multi-Account Switcher: Real CR vs Demo VRTC)
 * - Direct API Token Authentication (with localStorage persistence)
 * - 1,000 Historical Ticks Preload + Live Tick Stream across all Synthetic Indices
 * - 1st-Order Markov Chain Transition Matrix + Drought & Frequency Ensemble
 * - Automated Capped D'Alembert & Split Recovery Money Management
 * - Live Proposal & Buy Execution with real contract tracking
 */

const DEFAULT_DERIV_APP_ID = '1089';
const DERIV_WS_BASE = 'wss://ws.derivws.com/websockets/v3';

class DerivDigitBot {
  constructor() {
    this.appId = localStorage.getItem('deriv_app_id') || DEFAULT_DERIV_APP_ID;
    this.wsUrl = `${DERIV_WS_BASE}?app_id=${this.appId}`;

    // WebSocket state
    this.ws = null;
    this.pingInterval = null;
    this.isConnected = false;
    this.isAuthorized = false;
    this.pipSize = 2;
    this.currentSymbol = '1HZ100V';
    this.windowSize = 500;

    // Accounts State (OAuth & Manual Tokens)
    this.accounts = []; // [{ loginid, token, currency, isVirtual }]
    this.activeAccount = null;

    // Web Audio FX
    this.audioCtx = null;

    // Tick & Digit Ring Buffer (up to 1,000 ticks)
    this.ticks = []; // { epoch, quote, quoteStr, digit }
    this.maxBuffer = 1000;

    // Quantitative Statistics State
    this.stats = {
      freqCounts: new Array(10).fill(0),
      freqPcts: new Array(10).fill(10),
      droughts: new Array(10).fill(0),
      markovCounts: Array.from({ length: 10 }, () => new Array(10).fill(0)),
      markovProbs: Array.from({ length: 10 }, () => new Array(10).fill(10)),
      chiSquare: 0,
      entropy: 0,
      evenPct: 50,
      oddPct: 50,
      recommendedPrefix: 'DIFF',
      recommendedDigit: 0,
      recommendedReason: 'Initializing...',
      confidence: 0,
      markovMinProb: 10
    };

    // Bot & Risk Management State
    this.botRunning = false;
    this.execMode = 'PAPER'; // 'PAPER' | 'LIVE'
    this.paperBalance = 1000.0;
    this.liveBalance = 0.0;
    this.liveCurrency = 'USD';
    this.netPnl = 0.0;
    this.equityHistory = [0];

    this.totalTrades = 0;
    this.wins = 0;
    this.losses = 0;
    this.currentStreak = 0;
    this.consecLosses = 0;
    this.dalembertStep = 0;
    this.recoveryLossPool = 0;
    this.ticksSinceLastTrade = 999;

    // Active Contract
    this.activeContract = null;
    this.tradeHistory = [];

    this.initDOM();
    this.parseOAuthRedirect();
    this.loadSavedAccounts();
    this.renderInitialGrids();
    this.drawEquityCurve();
    this.connectWebSocket();
  }

  /* ============================================================================
   * INITIALIZATION & DOM BINDING
   * ============================================================================ */
  initDOM() {
    // Header & Auth
    this.symbolSelect = document.getElementById('symbolSelect');
    this.execModeSelect = document.getElementById('execModeSelect');
    this.accountPill = document.getElementById('accountPill');
    this.accountTypeTag = document.getElementById('accountTypeTag');
    this.accountSelect = document.getElementById('accountSelect');
    this.headerBalance = document.getElementById('headerBalance');
    this.logoutBtn = document.getElementById('logoutBtn');
    this.authActionsGroup = document.getElementById('authActionsGroup');
    this.derivOAuthBtn = document.getElementById('derivOAuthBtn');
    this.openTokenModalBtn = document.getElementById('openTokenModalBtn');
    this.soundToggle = document.getElementById('soundToggle');
    this.wsStatusBadge = document.getElementById('wsStatusBadge');
    this.wsStatusText = document.getElementById('wsStatusText');
    this.marketStatusPill = document.getElementById('marketStatusPill');

    // Hero Metrics
    this.livePriceDisplay = document.getElementById('livePriceDisplay');
    this.liveDigitBadge = document.getElementById('liveDigitBadge');
    this.tickCountSub = document.getElementById('tickCountSub');
    this.bestTargetPrefix = document.getElementById('bestTargetPrefix');
    this.bestTargetDigit = document.getElementById('bestTargetDigit');
    this.bestTargetReason = document.getElementById('bestTargetReason');
    this.confidenceDisplay = document.getElementById('confidenceDisplay');
    this.chiSquareSub = document.getElementById('chiSquareSub');
    this.winRateDisplay = document.getElementById('winRateDisplay');
    this.winLossSub = document.getElementById('winLossSub');
    this.balanceDisplay = document.getElementById('balanceDisplay');
    this.netPnlDisplay = document.getElementById('netPnlDisplay');

    // Left Column Analytics
    this.tickTape = document.getElementById('tickTape');
    this.evenOddRatioBadge = document.getElementById('evenOddRatioBadge');
    this.digitDistributionGrid = document.getElementById('digitDistributionGrid');
    this.markovTable = document.getElementById('markovTable');
    this.activeMarkovRowBadge = document.getElementById('activeMarkovRowBadge');

    // Right Column Strategy & Bot
    this.botStateBadge = document.getElementById('botStateBadge');
    this.bannerContractPrefix = document.getElementById('bannerContractPrefix');
    this.bannerTargetDigit = document.getElementById('bannerTargetDigit');
    this.bannerSignalTitle = document.getElementById('bannerSignalTitle');
    this.bannerSignalSub = document.getElementById('bannerSignalSub');
    this.nextStakePreview = document.getElementById('nextStakePreview');

    this.contractTypeSelect = document.getElementById('contractTypeSelect');
    this.strategyModeSelect = document.getElementById('strategyModeSelect');
    this.baseStakeInput = document.getElementById('baseStakeInput');
    this.sizingModeSelect = document.getElementById('sizingModeSelect');
    this.minConfidenceInput = document.getElementById('minConfidenceInput');
    this.cooldownTicksInput = document.getElementById('cooldownTicksInput');
    this.takeProfitInput = document.getElementById('takeProfitInput');
    this.stopLossInput = document.getElementById('stopLossInput');
    this.maxConsecLossesInput = document.getElementById('maxConsecLossesInput');
    this.durationTicksInput = document.getElementById('durationTicksInput');

    this.startBotBtn = document.getElementById('startBotBtn');
    this.stopBotBtn = document.getElementById('stopBotBtn');
    this.manualSnipeBtn = document.getElementById('manualSnipeBtn');
    this.resetSessionBtn = document.getElementById('resetSessionBtn');

    this.streakBadge = document.getElementById('streakBadge');
    this.tradeTableBody = document.getElementById('tradeTableBody');
    this.equityCanvas = document.getElementById('equityCanvas');

    // Modal
    this.tokenModal = document.getElementById('tokenModal');
    this.closeTokenModalBtn = document.getElementById('closeTokenModalBtn');
    this.modalTokenInput = document.getElementById('modalTokenInput');
    this.modalAppIdInput = document.getElementById('modalAppIdInput');
    this.saveTokenBtn = document.getElementById('saveTokenBtn');
    this.toastContainer = document.getElementById('toastContainer');

    // Listeners
    this.symbolSelect.addEventListener('change', (e) => {
      this.currentSymbol = e.target.value;
      this.subscribeToSymbol(this.currentSymbol);
    });

    this.execModeSelect.addEventListener('change', (e) => {
      this.execMode = e.target.value;
      if (this.execMode === 'LIVE' && !this.isAuthorized) {
        this.showToast('Please log in with Deriv or enter an API token to trade in Live mode.', 'error');
        this.openTokenModal();
      }
      this.updateBalanceDisplay();
    });

    this.derivOAuthBtn.addEventListener('click', () => this.startOAuthLogin());
    this.openTokenModalBtn.addEventListener('click', () => this.openTokenModal());
    this.closeTokenModalBtn.addEventListener('click', () => this.closeTokenModal());
    this.saveTokenBtn.addEventListener('click', () => this.saveManualToken());
    this.logoutBtn.addEventListener('click', () => this.logout());

    this.accountSelect.addEventListener('change', (e) => {
      const selectedId = e.target.value;
      const acct = this.accounts.find(a => a.loginid === selectedId);
      if (acct) {
        this.switchAccount(acct);
      }
    });

    this.contractTypeSelect.addEventListener('change', () => {
      this.recalculateStats();
      this.updateUI();
    });

    this.strategyModeSelect.addEventListener('change', () => {
      this.recalculateStats();
      this.updateUI();
    });

    this.baseStakeInput.addEventListener('input', () => this.updateNextStakePreview());
    this.sizingModeSelect.addEventListener('change', () => this.updateNextStakePreview());

    this.startBotBtn.addEventListener('click', () => this.startBot());
    this.stopBotBtn.addEventListener('click', () => this.stopBot('USER STOPPED'));
    this.manualSnipeBtn.addEventListener('click', () => this.executeTrade('MANUAL SNIPE'));
    this.resetSessionBtn.addEventListener('click', () => this.resetSession());

    window.addEventListener('resize', () => this.drawEquityCurve());
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
    toast.textContent = message;
    this.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  playTone(freq = 660, durationMs = 90, type = 'sine') {
    if (!this.soundToggle || !this.soundToggle.checked) return;
    try {
      if (!this.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContext();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.06, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + durationMs / 1000);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + durationMs / 1000);
    } catch (_) {}
  }

  /* ============================================================================
   * DERIV OAUTH2 & TOKEN AUTHENTICATION
   * ============================================================================ */
  startOAuthLogin() {
    const oauthUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${this.appId}&l=en&brand=deriv`;
    window.location.href = oauthUrl;
  }

  parseOAuthRedirect() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('token1')) {
      const parsedAccounts = [];
      let i = 1;
      while (params.has(`acct${i}`) && params.has(`token${i}`)) {
        const loginid = params.get(`acct${i}`);
        const token = params.get(`token${i}`);
        const currency = params.get(`cur${i}`) || 'USD';
        const isVirtual = loginid.startsWith('VRTC') || loginid.startsWith('VRT');
        parsedAccounts.push({ loginid, token, currency, isVirtual });
        i++;
      }

      if (parsedAccounts.length > 0) {
        this.accounts = parsedAccounts;
        localStorage.setItem('deriv_accounts', JSON.stringify(this.accounts));
        this.activeAccount = parsedAccounts[0];
        localStorage.setItem('deriv_active_account', JSON.stringify(this.activeAccount));
        // Clean URL query string
        window.history.replaceState({}, document.title, window.location.pathname);
        this.showToast(`Logged in successfully with ${parsedAccounts.length} Deriv account(s)!`, 'success');
      }
    }
  }

  loadSavedAccounts() {
    try {
      const saved = localStorage.getItem('deriv_accounts');
      if (saved) {
        this.accounts = JSON.parse(saved);
        const active = localStorage.getItem('deriv_active_account');
        if (active) {
          this.activeAccount = JSON.parse(active);
        } else if (this.accounts.length > 0) {
          this.activeAccount = this.accounts[0];
        }
      }
    } catch (e) {
      console.warn('Failed to load saved accounts:', e);
    }
  }

  updateAccountUI() {
    if (this.isAuthorized && this.activeAccount) {
      this.accountPill.style.display = 'flex';
      this.authActionsGroup.style.display = 'none';

      const isReal = !this.activeAccount.isVirtual;
      this.accountTypeTag.textContent = isReal ? 'REAL' : 'DEMO';
      this.accountTypeTag.className = `account-type-tag ${isReal ? 'tag-real' : 'tag-demo'}`;

      this.accountSelect.innerHTML = this.accounts.map(a => `
        <option value="${a.loginid}" ${a.loginid === this.activeAccount.loginid ? 'selected' : ''}>
          ${a.loginid} (${a.currency})
        </option>
      `).join('');

      this.headerBalance.textContent = `$${this.liveBalance.toFixed(2)}`;
    } else {
      this.accountPill.style.display = 'none';
      this.authActionsGroup.style.display = 'flex';
    }
  }

  switchAccount(account) {
    this.activeAccount = account;
    localStorage.setItem('deriv_active_account', JSON.stringify(account));
    this.showToast(`Switching to account ${account.loginid}...`, 'info');
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify({ authorize: account.token }));
    }
  }

  logout() {
    this.accounts = [];
    this.activeAccount = null;
    this.isAuthorized = false;
    this.liveBalance = 0;
    localStorage.removeItem('deriv_accounts');
    localStorage.removeItem('deriv_active_account');
    this.updateAccountUI();
    this.showToast('Logged out of Deriv.', 'info');
  }

  openTokenModal() {
    this.modalAppIdInput.value = this.appId;
    this.tokenModal.style.display = 'flex';
  }

  closeTokenModal() {
    this.tokenModal.style.display = 'none';
  }

  saveManualToken() {
    const token = this.modalTokenInput.value.trim();
    const customAppId = this.modalAppIdInput.value.trim();

    if (customAppId && customAppId !== this.appId) {
      this.appId = customAppId;
      localStorage.setItem('deriv_app_id', customAppId);
      this.wsUrl = `${DERIV_WS_BASE}?app_id=${this.appId}`;
      this.connectWebSocket();
    }

    if (!token) {
      alert('Please enter an API token.');
      return;
    }

    this.showToast('Authorizing token with Deriv...', 'info');
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify({ authorize: token }));
      this.pendingManualToken = token;
    }
    this.closeTokenModal();
  }

  /* ============================================================================
   * WEBSOCKET CONNECTION & TICK STREAM
   * ============================================================================ */
  connectWebSocket() {
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
    }

    this.setConnectionStatus(false, 'Connecting...');
    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      this.isConnected = true;
      this.setConnectionStatus(true, 'Live Connected');
      this.subscribeToSymbol(this.currentSymbol);

      // Auto-authorize if saved account exists
      if (this.activeAccount && this.activeAccount.token) {
        this.ws.send(JSON.stringify({ authorize: this.activeAccount.token }));
      }

      if (this.pingInterval) clearInterval(this.pingInterval);
      this.pingInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ ping: 1 }));
        }
      }, 25000);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (err) {
        console.error('WS Parse Error:', err);
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.isAuthorized = false;
      this.setConnectionStatus(false, 'Reconnecting in 3s...');
      this.updateAccountUI();
      setTimeout(() => this.connectWebSocket(), 3000);
    };

    this.ws.onerror = () => {
      this.setConnectionStatus(false, 'Connection Error');
    };
  }

  setConnectionStatus(connected, text) {
    this.wsStatusText.textContent = text;
    if (connected) {
      this.wsStatusBadge.classList.remove('disconnected');
    } else {
      this.wsStatusBadge.classList.add('disconnected');
    }
  }

  subscribeToSymbol(symbol) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ticks = [];
    this.ws.send(JSON.stringify({ forget_all: 'ticks' }));
    this.ws.send(JSON.stringify({
      ticks_history: symbol,
      adjust_start_time: 1,
      count: 1000,
      end: 'latest',
      start: 1,
      style: 'ticks',
      subscribe: 1
    }));
  }

  extractLastDigit(quoteVal, pipSize) {
    const formatted = Number(quoteVal).toFixed(pipSize);
    const lastChar = formatted.charAt(formatted.length - 1);
    return {
      quoteStr: formatted,
      digit: parseInt(lastChar, 10)
    };
  }

  handleMessage(data) {
    if (data.error) {
      console.warn('Deriv API Error:', data.error);
      this.showToast(`Deriv: ${data.error.message}`, 'error');

      if (data.msg_type === 'buy') {
        this.activeContract = null;
        this.renderTradeTable();
      }
      return;
    }

    // 1. Historical Ticks Preload
    if (data.msg_type === 'history' && data.history) {
      if (typeof data.pip_size === 'number') {
        this.pipSize = data.pip_size;
      }
      const prices = data.history.prices || [];
      const times = data.history.times || [];
      this.ticks = [];

      for (let i = 0; i < prices.length; i++) {
        const { quoteStr, digit } = this.extractLastDigit(prices[i], this.pipSize);
        this.ticks.push({
          epoch: times[i],
          quote: Number(prices[i]),
          quoteStr,
          digit
        });
      }

      if (this.ticks.length > this.maxBuffer) {
        this.ticks = this.ticks.slice(-this.maxBuffer);
      }

      this.recalculateStats();
      this.updateUI();
    }

    // 2. Live Incoming Tick
    if (data.msg_type === 'tick' && data.tick) {
      if (typeof data.tick.pip_size === 'number') {
        this.pipSize = data.tick.pip_size;
      }
      const { quoteStr, digit } = this.extractLastDigit(data.tick.quote, this.pipSize);
      const tickObj = {
        epoch: data.tick.epoch,
        quote: Number(data.tick.quote),
        quoteStr,
        digit
      };

      this.ticks.push(tickObj);
      if (this.ticks.length > this.maxBuffer) {
        this.ticks.shift();
      }

      this.ticksSinceLastTrade++;
      this.processOpenPaperContract(tickObj);
      this.recalculateStats();
      this.updateUI();
      this.evaluateAutoBot(tickObj);
    }

    // 3. Authorization Success
    if (data.msg_type === 'authorize' && data.authorize) {
      this.isAuthorized = true;
      const auth = data.authorize;
      this.liveBalance = Number(auth.balance);
      this.liveCurrency = auth.currency || 'USD';

      const isVirtual = Boolean(auth.is_virtual);
      const loginid = auth.loginid;

      // Update active account
      this.activeAccount = {
        loginid,
        token: this.pendingManualToken || (this.activeAccount ? this.activeAccount.token : ''),
        currency: this.liveCurrency,
        isVirtual
      };

      if (!this.accounts.some(a => a.loginid === loginid)) {
        this.accounts.push(this.activeAccount);
      }
      localStorage.setItem('deriv_accounts', JSON.stringify(this.accounts));
      localStorage.setItem('deriv_active_account', JSON.stringify(this.activeAccount));
      this.pendingManualToken = null;

      this.showToast(`Authorized: ${loginid} ($${this.liveBalance.toFixed(2)})`, 'success');
      this.updateAccountUI();
      this.updateBalanceDisplay();

      // Subscribe to live balance updates
      this.ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
    }

    // 4. Live Balance Updates
    if (data.msg_type === 'balance' && data.balance) {
      this.liveBalance = Number(data.balance.balance);
      this.updateAccountUI();
      this.updateBalanceDisplay();
    }

    // 5. Live Buy Confirmation
    if (data.msg_type === 'buy' && data.buy) {
      const contractId = data.buy.contract_id;
      if (this.activeContract) {
        this.activeContract.contractId = contractId;
        this.activeContract.status = 'OPEN';
        this.renderTradeTable();
      }
      this.showToast(`Contract #${contractId} executed on Deriv!`, 'info');

      // Subscribe to contract lifecycle
      this.ws.send(JSON.stringify({
        proposal_open_contract: 1,
        contract_id: contractId,
        subscribe: 1
      }));
    }

    // 6. Live Contract Open Status & Settlement
    if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract) {
      const poc = data.proposal_open_contract;
      if (poc.is_sold && this.activeContract && this.activeContract.mode === 'LIVE') {
        const profit = Number(poc.profit);
        const isWin = profit > 0;
        const exitTickVal = poc.exit_tick_display_value || poc.exit_tick || '';
        const exitDigit = exitTickVal ? parseInt(String(exitTickVal).slice(-1), 10) : '-';

        this.settleContract(isWin, profit, String(exitTickVal), exitDigit);
      }
    }
  }

  /* ============================================================================
   * QUANTITATIVE STATISTICAL ENGINE
   * ============================================================================ */
  recalculateStats() {
    const sample = this.ticks.slice(-this.windowSize);
    const N = sample.length;
    if (N < 10) return;

    // 1. Frequency Distribution
    const counts = new Array(10).fill(0);
    let evenCount = 0;
    for (let i = 0; i < N; i++) {
      const d = sample[i].digit;
      counts[d]++;
      if (d % 2 === 0) evenCount++;
    }

    const pcts = counts.map(c => (c / N) * 100);
    this.stats.freqCounts = counts;
    this.stats.freqPcts = pcts;
    this.stats.evenPct = (evenCount / N) * 100;
    this.stats.oddPct = 100 - this.stats.evenPct;

    // 2. Recurrence Drought
    const droughts = new Array(10).fill(N);
    for (let d = 0; d <= 9; d++) {
      for (let i = sample.length - 1; i >= 0; i--) {
        if (sample[i].digit === d) {
          droughts[d] = (sample.length - 1) - i;
          break;
        }
      }
    }
    this.stats.droughts = droughts;

    // 3. First-Order Markov Transition Matrix
    const mCounts = Array.from({ length: 10 }, () => new Array(10).fill(0));
    const rowTotals = new Array(10).fill(0);

    for (let i = 0; i < N - 1; i++) {
      const curr = sample[i].digit;
      const next = sample[i + 1].digit;
      mCounts[curr][next]++;
      rowTotals[curr]++;
    }

    const mProbs = Array.from({ length: 10 }, () => new Array(10).fill(10.0));
    for (let r = 0; r <= 9; r++) {
      for (let c = 0; c <= 9; c++) {
        if (rowTotals[r] > 0) {
          mProbs[r][c] = (mCounts[r][c] / rowTotals[r]) * 100;
        }
      }
    }
    this.stats.markovCounts = mCounts;
    this.stats.markovProbs = mProbs;

    // 4. Chi-Square & Shannon Entropy
    const expected = N / 10;
    let chiSq = 0;
    let entropy = 0;
    for (let d = 0; d <= 9; d++) {
      const diff = counts[d] - expected;
      chiSq += (diff * diff) / expected;
      const p = counts[d] / N;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }
    this.stats.chiSquare = chiSq;
    this.stats.entropy = entropy;

    // 5. Target Selection & Signal Confidence
    const lastDigit = sample[sample.length - 1].digit;
    const prevDigit = sample.length >= 2 ? sample[sample.length - 2].digit : -1;
    const currentMarkovRow = mProbs[lastDigit];

    const contractType = this.contractTypeSelect.value;
    const strategyMode = this.strategyModeSelect.value;

    if (contractType === 'DIGITOVER_0') {
      const probLose = currentMarkovRow[0];
      const freq0 = pcts[0];
      const compositeEdge = 100 - (probLose * 0.65 + freq0 * 0.35);
      this.stats.recommendedPrefix = 'OVER';
      this.stats.recommendedDigit = 0;
      this.stats.markovMinProb = probLose;
      this.stats.recommendedReason = `OVER 0 (~90% WR) | P(0 | ${lastDigit}) = ${probLose.toFixed(1)}%, Freq(0) = ${freq0.toFixed(1)}%`;
      this.stats.confidence = Math.min(99, Math.max(50, 50 + (compositeEdge - 88) * 5.2));
      return;
    }

    if (contractType === 'DIGITUNDER_9') {
      const probLose = currentMarkovRow[9];
      const freq9 = pcts[9];
      const compositeEdge = 100 - (probLose * 0.65 + freq9 * 0.35);
      this.stats.recommendedPrefix = 'UNDER';
      this.stats.recommendedDigit = 9;
      this.stats.markovMinProb = probLose;
      this.stats.recommendedReason = `UNDER 9 (~90% WR) | P(9 | ${lastDigit}) = ${probLose.toFixed(1)}%, Freq(9) = ${freq9.toFixed(1)}%`;
      this.stats.confidence = Math.min(99, Math.max(50, 50 + (compositeEdge - 88) * 5.2));
      return;
    }

    if (contractType === 'DIGITOVER_1') {
      const probLose = currentMarkovRow[0] + currentMarkovRow[1];
      const expectedWinProb = Math.max(0, 100 - probLose);
      this.stats.recommendedPrefix = 'OVER';
      this.stats.recommendedDigit = 1;
      this.stats.markovMinProb = probLose;
      this.stats.recommendedReason = `OVER 1 (~80% WR) | P(0,1 | ${lastDigit}) = ${probLose.toFixed(1)}%`;
      this.stats.confidence = Math.min(98, Math.max(50, expectedWinProb));
      return;
    }

    if (contractType === 'DIGITUNDER_8') {
      const probLose = currentMarkovRow[8] + currentMarkovRow[9];
      const expectedWinProb = Math.max(0, 100 - probLose);
      this.stats.recommendedPrefix = 'UNDER';
      this.stats.recommendedDigit = 8;
      this.stats.markovMinProb = probLose;
      this.stats.recommendedReason = `UNDER 8 (~80% WR) | P(8,9 | ${lastDigit}) = ${probLose.toFixed(1)}%`;
      this.stats.confidence = Math.min(98, Math.max(50, expectedWinProb));
      return;
    }

    // Default: DIGITDIFF (Highest Win-Rate)
    this.stats.recommendedPrefix = 'DIFF';
    let bestDigit = 0;
    let bestScore = Infinity;
    let reason = '';

    if (strategyMode === 'MARKOV_MIN') {
      for (let d = 0; d <= 9; d++) {
        const score = currentMarkovRow[d] + (pcts[d] * 0.05);
        if (score < bestScore) {
          bestScore = score;
          bestDigit = d;
        }
      }
      const mProb = currentMarkovRow[bestDigit];
      reason = `Markov Min: P(${bestDigit} | ${lastDigit}) = ${mProb.toFixed(1)}%, Freq=${pcts[bestDigit].toFixed(1)}%`;
    } else if (strategyMode === 'COLDEST') {
      for (let d = 0; d <= 9; d++) {
        if (pcts[d] < bestScore) {
          bestScore = pcts[d];
          bestDigit = d;
        }
      }
      reason = `Coldest Freq: ${bestScore.toFixed(1)}% (${counts[bestDigit]}/${N})`;
    } else if (strategyMode === 'POST_CLUSTER') {
      if (lastDigit === prevDigit) {
        bestDigit = lastDigit;
        bestScore = currentMarkovRow[bestDigit];
        reason = `2x Repeat Cluster Exhaustion on Digit ${bestDigit} (P=${bestScore.toFixed(1)}%)`;
      } else {
        for (let d = 0; d <= 9; d++) {
          const score = currentMarkovRow[d] * 0.65 + pcts[d] * 0.35;
          if (score < bestScore) {
            bestScore = score;
            bestDigit = d;
          }
        }
        reason = `Waiting for 2x Cluster (Standby Target: ${bestDigit})`;
      }
    } else {
      // Hybrid Ensemble
      for (let d = 0; d <= 9; d++) {
        const markovP = currentMarkovRow[d];
        const freqP = pcts[d];
        const droughtPenalty = droughts[d] > 26 ? 4.5 : (droughts[d] < 2 ? -1.5 : 0);
        const compositeScore = (markovP * 0.62) + (freqP * 0.38) + droughtPenalty;

        if (compositeScore < bestScore) {
          bestScore = compositeScore;
          bestDigit = d;
        }
      }
      reason = `Hybrid: P(${bestDigit}|${lastDigit})=${currentMarkovRow[bestDigit].toFixed(1)}%, Freq=${pcts[bestDigit].toFixed(1)}%`;
    }

    const matchProb = currentMarkovRow[bestDigit];
    const differTheoreticalEdge = 100 - ((matchProb * 0.62) + (pcts[bestDigit] * 0.38));

    let conf = 50 + (differTheoreticalEdge - 88) * 5.2 + Math.min(8, this.stats.chiSquare * 0.35);
    if (strategyMode === 'POST_CLUSTER' && lastDigit !== prevDigit) {
      conf = Math.min(conf, 64);
    }
    conf = Math.max(50, Math.min(99.4, conf));

    this.stats.recommendedDigit = bestDigit;
    this.stats.markovMinProb = matchProb;
    this.stats.recommendedReason = reason;
    this.stats.confidence = conf;
  }

  /* ============================================================================
   * RISK MANAGER, SIZING & EXECUTION
   * ============================================================================ */
  getCurrentStake() {
    const base = Math.max(0.35, parseFloat(this.baseStakeInput.value) || 10);
    const mode = this.sizingModeSelect.value;

    if (mode === 'FLAT') {
      return Number(base.toFixed(2));
    }

    if (mode === 'DALEMBERT') {
      const multiplier = Math.min(5, 1 + this.dalembertStep * 0.75);
      return Number((base * multiplier).toFixed(2));
    }

    if (mode === 'SPLIT_RECOVERY') {
      if (this.recoveryLossPool <= 0) return Number(base.toFixed(2));
      const targetRecovery = this.recoveryLossPool / 2.2;
      const estPayoutRate = this.getPayoutRate();
      const neededStake = base + (targetRecovery / estPayoutRate);
      return Number(Math.min(base * 3.5, neededStake).toFixed(2));
    }

    return Number(base.toFixed(2));
  }

  getPayoutRate() {
    const cType = this.contractTypeSelect.value;
    if (cType === 'DIGITDIFF' || cType === 'DIGITOVER_0' || cType === 'DIGITUNDER_9') {
      return 0.096;
    }
    return 0.235;
  }

  startBot() {
    if (this.execMode === 'LIVE' && !this.isAuthorized) {
      this.showToast('Please log in with Deriv first or switch to Paper mode.', 'error');
      this.openTokenModal();
      return;
    }
    this.botRunning = true;
    this.consecLosses = 0;
    this.startBotBtn.disabled = true;
    this.stopBotBtn.disabled = false;
    this.botStateBadge.textContent = 'RUNNING (AUTO)';
    this.botStateBadge.style.background = 'rgba(16, 185, 129, 0.2)';
    this.botStateBadge.style.color = 'var(--accent-emerald)';
    this.playTone(740, 100, 'sine');
    this.showToast('Auto Bot Activated!', 'success');
  }

  stopBot(reason = 'STOPPED') {
    this.botRunning = false;
    this.startBotBtn.disabled = false;
    this.stopBotBtn.disabled = true;
    this.botStateBadge.textContent = reason;
    this.botStateBadge.style.background = 'rgba(244, 63, 94, 0.2)';
    this.botStateBadge.style.color = 'var(--accent-rose)';
  }

  evaluateAutoBot(latestTick) {
    if (!this.botRunning || this.activeContract) return;

    // 1. Session Stop Loss / Take Profit / Circuit Breaker
    const tp = parseFloat(this.takeProfitInput.value) || 50;
    const sl = parseFloat(this.stopLossInput.value) || 50;
    const maxCL = parseInt(this.maxConsecLossesInput.value, 10) || 2;

    if (this.netPnl >= tp) {
      this.stopBot('TAKE PROFIT REACHED');
      this.showToast('Session Take Profit Reached! Bot Paused.', 'success');
      return;
    }
    if (this.netPnl <= -sl) {
      this.stopBot('STOP LOSS HIT');
      this.showToast('Session Stop Loss Hit! Bot Paused.', 'error');
      return;
    }
    if (this.consecLosses >= maxCL) {
      this.stopBot(`CIRCUIT BREAKER (${maxCL}L)`);
      this.showToast(`Circuit Breaker: ${maxCL} consecutive losses. Bot Paused.`, 'error');
      return;
    }

    // 2. Cooldown Ticks
    const cooldown = parseInt(this.cooldownTicksInput.value, 10) || 2;
    if (this.ticksSinceLastTrade < cooldown) return;

    // 3. Minimum Confidence Threshold
    const minConf = parseFloat(this.minConfidenceInput.value) || 76;
    if (this.stats.confidence >= minConf && this.ticks.length >= 50) {
      this.executeTrade('AUTO SIGNAL');
    }
  }

  executeTrade(triggerSource = 'AUTO') {
    if (this.activeContract) return;
    if (this.ticks.length === 0) return;

    const latestTick = this.ticks[this.ticks.length - 1];
    const stake = this.getCurrentStake();
    const duration = Math.max(1, parseInt(this.durationTicksInput.value, 10) || 1);
    const cTypeRaw = this.contractTypeSelect.value;

    let apiContractType = 'DIGITDIFF';
    let barrier = this.stats.recommendedDigit;
    let label = `DIFF ${barrier}`;

    if (cTypeRaw === 'DIGITOVER_0') {
      apiContractType = 'DIGITOVER';
      barrier = 0;
      label = 'OVER 0';
    } else if (cTypeRaw === 'DIGITUNDER_9') {
      apiContractType = 'DIGITUNDER';
      barrier = 9;
      label = 'UNDER 9';
    } else if (cTypeRaw === 'DIGITOVER_1') {
      apiContractType = 'DIGITOVER';
      barrier = 1;
      label = 'OVER 1';
    } else if (cTypeRaw === 'DIGITUNDER_8') {
      apiContractType = 'DIGITUNDER';
      barrier = 8;
      label = 'UNDER 8';
    }

    this.ticksSinceLastTrade = 0;

    this.activeContract = {
      id: this.totalTrades + 1,
      time: new Date().toLocaleTimeString(),
      symbol: this.currentSymbol,
      contractType: apiContractType,
      barrier: barrier,
      label: label,
      entryQuote: latestTick.quoteStr,
      entryDigit: latestTick.digit,
      stake: stake,
      durationTicks: duration,
      remainingTicks: duration,
      mode: this.execMode,
      triggerSource,
      status: 'OPEN'
    };

    this.renderTradeTable();
    this.playTone(520, 80, 'sine');

    if (this.execMode === 'LIVE') {
      if (!this.isAuthorized) {
        this.activeContract = null;
        this.showToast('Not authorized! Log in or enter API token first.', 'error');
        this.openTokenModal();
        return;
      }

      // Execute live contract on Deriv
      this.ws.send(JSON.stringify({
        buy: 1,
        price: stake,
        parameters: {
          amount: stake,
          basis: 'stake',
          contract_type: apiContractType,
          currency: this.liveCurrency,
          duration: duration,
          duration_unit: 't',
          symbol: this.currentSymbol,
          barrier: String(barrier)
        }
      }));
    }
  }

  processOpenPaperContract(tickObj) {
    if (!this.activeContract || this.activeContract.mode !== 'PAPER') return;

    this.activeContract.remainingTicks--;
    if (this.activeContract.remainingTicks <= 0) {
      const exitDigit = tickObj.digit;
      const barrier = this.activeContract.barrier;
      const cType = this.activeContract.contractType;

      let isWin = false;
      if (cType === 'DIGITDIFF') {
        isWin = exitDigit !== barrier;
      } else if (cType === 'DIGITOVER') {
        isWin = exitDigit > barrier;
      } else if (cType === 'DIGITUNDER') {
        isWin = exitDigit < barrier;
      }

      const payoutRate = this.getPayoutRate();
      const profit = isWin
        ? Number((this.activeContract.stake * payoutRate).toFixed(2))
        : -this.activeContract.stake;

      this.settleContract(isWin, profit, tickObj.quoteStr, exitDigit);
    }
  }

  settleContract(isWin, profit, exitQuote, exitDigit) {
    if (!this.activeContract) return;

    const settled = {
      ...this.activeContract,
      exitQuote,
      exitDigit,
      profit,
      isWin,
      status: isWin ? 'WIN' : 'LOSS'
    };

    this.activeContract = null;
    this.totalTrades++;
    this.netPnl = Number((this.netPnl + profit).toFixed(2));
    this.equityHistory.push(this.netPnl);

    if (this.execMode === 'PAPER') {
      this.paperBalance = Number((this.paperBalance + profit).toFixed(2));
    }

    if (isWin) {
      this.wins++;
      this.consecLosses = 0;
      this.currentStreak = this.currentStreak > 0 ? this.currentStreak + 1 : 1;
      this.dalembertStep = Math.max(0, this.dalembertStep - 1);
      this.recoveryLossPool = Math.max(0, this.recoveryLossPool - profit);
      this.playTone(880, 85, 'sine');
      this.showToast(`WON +$${profit.toFixed(2)} on ${settled.label} [Exit: ${exitDigit}]`, 'success');
    } else {
      this.losses++;
      this.consecLosses++;
      this.currentStreak = this.currentStreak < 0 ? this.currentStreak - 1 : -1;
      this.dalembertStep = Math.min(5, this.dalembertStep + 2);
      this.recoveryLossPool += Math.abs(profit);
      this.playTone(240, 180, 'triangle');
      this.showToast(`LOST -$${Math.abs(profit).toFixed(2)} on ${settled.label} [Exit: ${exitDigit}]`, 'error');
    }

    this.tradeHistory.unshift(settled);
    if (this.tradeHistory.length > 100) {
      this.tradeHistory.pop();
    }

    this.updateBalanceDisplay();
    this.updateNextStakePreview();
    this.renderTradeTable();
    this.drawEquityCurve();
  }

  resetSession() {
    this.stopBot('IDLE');
    this.paperBalance = 1000.0;
    this.netPnl = 0.0;
    this.equityHistory = [0];
    this.totalTrades = 0;
    this.wins = 0;
    this.losses = 0;
    this.currentStreak = 0;
    this.consecLosses = 0;
    this.dalembertStep = 0;
    this.recoveryLossPool = 0;
    this.tradeHistory = [];
    this.activeContract = null;

    this.updateBalanceDisplay();
    this.updateNextStakePreview();
    this.renderTradeTable();
    this.drawEquityCurve();
    this.showToast('Session stats reset.', 'info');
  }

  /* ============================================================================
   * UI RENDERING & CHARTS
   * ============================================================================ */
  renderInitialGrids() {
    let html = '';
    for (let d = 0; d <= 9; d++) {
      html += `
        <div class="digit-col" id="digitCol_${d}">
          <div class="digit-tag" id="digitTag_${d}"></div>
          <div class="bar-wrapper">
            <div class="bar-baseline"></div>
            <div class="bar-fill" id="digitBar_${d}" style="height: 50%;"></div>
          </div>
          <div class="digit-number">${d}</div>
          <div class="digit-pct" id="digitPct_${d}">10.0%</div>
          <div class="digit-drought" id="digitDrought_${d}">0t ago</div>
        </div>
      `;
    }
    this.digitDistributionGrid.innerHTML = html;

    let tableHtml = '<thead><tr><th>Curr \\ Next</th>';
    for (let c = 0; c <= 9; c++) {
      tableHtml += `<th>→ ${c}</th>`;
    }
    tableHtml += '</tr></thead><tbody>';

    for (let r = 0; r <= 9; r++) {
      tableHtml += `<tr id="markovRow_${r}"><th>Digit ${r}</th>`;
      for (let c = 0; c <= 9; c++) {
        tableHtml += `<td id="markovCell_${r}_${c}">10.0%</td>`;
      }
      tableHtml += `</tr>`;
    }
    tableHtml += '</tbody>';
    this.markovTable.innerHTML = tableHtml;
  }

  updateUI() {
    const N = Math.min(this.ticks.length, this.windowSize);
    if (N === 0) return;

    const latest = this.ticks[this.ticks.length - 1];
    this.livePriceDisplay.textContent = latest.quoteStr;
    this.liveDigitBadge.textContent = latest.digit;
    this.tickCountSub.textContent = `Window: ${N} / ${this.windowSize} ticks`;

    const recDigit = this.stats.recommendedDigit;
    const recPrefix = this.stats.recommendedPrefix || 'DIFF';
    this.bestTargetPrefix.textContent = recPrefix;
    this.bestTargetDigit.textContent = recDigit;
    this.bestTargetReason.textContent = this.stats.recommendedReason;
    this.confidenceDisplay.textContent = `${this.stats.confidence.toFixed(1)}%`;
    this.confidenceDisplay.style.color =
      this.stats.confidence >= 76 ? 'var(--accent-emerald)' :
      this.stats.confidence >= 66 ? 'var(--accent-cyan)' : 'var(--text-primary)';

    this.chiSquareSub.textContent = `χ²: ${this.stats.chiSquare.toFixed(1)} | Entropy: ${this.stats.entropy.toFixed(2)}b`;

    this.bannerContractPrefix.textContent = recPrefix;
    this.bannerTargetDigit.textContent = recDigit;
    this.bannerSignalTitle.textContent = this.stats.recommendedReason;
    const matchP = this.stats.markovMinProb;
    this.bannerSignalSub.textContent =
      `Conditional P(Lose): ${matchP.toFixed(1)}% | Win Expectancy: ${(100 - matchP).toFixed(1)}%`;

    this.updateNextStakePreview();
    this.updateBalanceDisplay();

    // Recent 25 Ticks Tape
    const recent25 = this.ticks.slice(-25);
    this.tickTape.innerHTML = recent25.map((t, idx) => {
      const isLatest = idx === recent25.length - 1;
      const isTarget = t.digit === recDigit;
      const cls = ['tick-pill'];
      if (isLatest) cls.push('latest');
      if (isTarget) cls.push('target-diff');
      return `<div class="${cls.join(' ')}" title="${t.quoteStr}">${t.digit}</div>`;
    }).join('');

    this.evenOddRatioBadge.textContent =
      `Even: ${this.stats.evenPct.toFixed(1)}% | Odd: ${this.stats.oddPct.toFixed(1)}%`;

    // 0-9 Distribution Bars
    const maxPct = Math.max(20, ...this.stats.freqPcts);
    const minFreq = Math.min(...this.stats.freqPcts);
    const maxFreq = Math.max(...this.stats.freqPcts);

    for (let d = 0; d <= 9; d++) {
      const col = document.getElementById(`digitCol_${d}`);
      const tag = document.getElementById(`digitTag_${d}`);
      const bar = document.getElementById(`digitBar_${d}`);
      const pctEl = document.getElementById(`digitPct_${d}`);
      const droughtEl = document.getElementById(`digitDrought_${d}`);

      const pct = this.stats.freqPcts[d];
      const drought = this.stats.droughts[d];

      col.classList.toggle('active-digit', d === latest.digit);
      col.classList.toggle('recommended-diff', d === recDigit);
      col.classList.toggle('hot-digit', pct === maxFreq && d !== recDigit);

      if (d === recDigit) {
        tag.textContent = 'TARGET';
        tag.className = 'digit-tag tag-cold';
      } else if (pct === maxFreq) {
        tag.textContent = 'HOT';
        tag.className = 'digit-tag tag-hot';
      } else if (pct === minFreq) {
        tag.textContent = 'COLD';
        tag.className = 'digit-tag tag-cold';
      } else {
        tag.textContent = '';
        tag.className = 'digit-tag';
      }

      const barHeight = Math.min(100, Math.max(6, (pct / maxPct) * 100));
      bar.style.height = `${barHeight}%`;
      pctEl.textContent = `${pct.toFixed(1)}%`;
      droughtEl.textContent = drought === 0 ? 'NOW' : `${drought}t ago`;
    }

    // 10x10 Markov Matrix Heatmap
    this.activeMarkovRowBadge.textContent = `Active Row: Digit ${latest.digit}`;
    for (let r = 0; r <= 9; r++) {
      const rowEl = document.getElementById(`markovRow_${r}`);
      rowEl.classList.toggle('markov-row-active', r === latest.digit);

      for (let c = 0; c <= 9; c++) {
        const cell = document.getElementById(`markovCell_${r}_${c}`);
        const prob = this.stats.markovProbs[r][c];
        cell.textContent = `${prob.toFixed(1)}%`;

        const isBestInActiveRow = (r === latest.digit && c === recDigit);
        cell.classList.toggle('markov-cell-best', isBestInActiveRow);

        if (prob <= 5.0) {
          cell.style.background = 'rgba(16, 185, 129, 0.22)';
          cell.style.color = '#34d399';
        } else if (prob >= 16.0) {
          cell.style.background = 'rgba(244, 63, 94, 0.22)';
          cell.style.color = '#fb7185';
        } else {
          cell.style.background = 'transparent';
          cell.style.color = 'var(--text-secondary)';
        }
      }
    }
  }

  updateNextStakePreview() {
    const nextStake = this.getCurrentStake();
    this.nextStakePreview.textContent = `$${nextStake.toFixed(2)}`;
  }

  updateBalanceDisplay() {
    const bal = this.execMode === 'LIVE' ? this.liveBalance : this.paperBalance;
    this.balanceDisplay.textContent = `$${bal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const sign = this.netPnl >= 0 ? '+' : '';
    const pct = ((this.netPnl / 1000) * 100).toFixed(2);
    this.netPnlDisplay.textContent = `Net PnL: ${sign}$${this.netPnl.toFixed(2)} (${sign}${pct}%)`;
    this.netPnlDisplay.className = 'metric-sub ' + (this.netPnl >= 0 ? 'pnl-pos' : 'pnl-neg');

    const wr = this.totalTrades > 0 ? (this.wins / this.totalTrades) * 100 : 0;
    this.winRateDisplay.textContent = `${wr.toFixed(1)}%`;
    this.winLossSub.textContent = `${this.wins}W / ${this.losses}L (${this.totalTrades} Total)`;

    const streakPrefix = this.currentStreak > 0 ? `+${this.currentStreak}W` :
                         this.currentStreak < 0 ? `${this.currentStreak}L` : '0';
    this.streakBadge.textContent = `Streak: ${streakPrefix}`;
  }

  renderTradeTable() {
    const rows = [];

    if (this.activeContract) {
      const ac = this.activeContract;
      rows.push(`
        <tr>
          <td>#${ac.id}</td>
          <td>${ac.time}</td>
          <td><strong>${ac.label}</strong></td>
          <td>${ac.entryQuote} [${ac.entryDigit}]</td>
          <td>Waiting (${ac.remainingTicks}t)...</td>
          <td>$${ac.stake.toFixed(2)}</td>
          <td>--</td>
          <td><span class="badge-open">OPEN</span></td>
        </tr>
      `);
    }

    for (const t of this.tradeHistory) {
      const pnlStr = (t.profit >= 0 ? '+$' : '-$') + Math.abs(t.profit).toFixed(2);
      const pnlClass = t.profit >= 0 ? 'pnl-pos' : 'pnl-neg';
      const badgeClass = t.isWin ? 'badge-win' : 'badge-loss';

      rows.push(`
        <tr>
          <td>#${t.id}</td>
          <td>${t.time}</td>
          <td><strong>${t.label}</strong></td>
          <td>${t.entryQuote} [${t.entryDigit}]</td>
          <td>${t.exitQuote} [<strong>${t.exitDigit}</strong>]</td>
          <td>$${t.stake.toFixed(2)}</td>
          <td class="${pnlClass}">${pnlStr}</td>
          <td><span class="${badgeClass}">${t.status}</span></td>
        </tr>
      `);
    }

    if (rows.length === 0) {
      this.tradeTableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">
            No trades executed yet. Click "Snipe 1 Trade Now" or start Auto Bot.
          </td>
        </tr>
      `;
    } else {
      this.tradeTableBody.innerHTML = rows.join('');
    }
  }

  drawEquityCurve() {
    const canvas = this.equityCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const data = this.equityHistory;
    if (data.length < 2) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      return;
    }

    const minVal = Math.min(0, ...data);
    const maxVal = Math.max(1, ...data);
    const range = Math.max(1, maxVal - minVal);
    const pad = 14;

    const getY = (val) => h - pad - ((val - minVal) / range) * (h - pad * 2);
    const getX = (idx) => pad + (idx / (data.length - 1)) * (w - pad * 2);

    const zeroY = getY(0);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(pad, zeroY);
    ctx.lineTo(w - pad, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    const isPositive = data[data.length - 1] >= 0;
    const strokeColor = isPositive ? '#10b981' : '#f43f5e';

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = getX(i);
      const y = getY(data[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.derivBot = new DerivDigitBot();
});
