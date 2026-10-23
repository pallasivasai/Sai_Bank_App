import React, { useEffect, useMemo, useState } from 'react';
import { supabase, configError } from './supabase.js';

const money = (value, currency = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));
const shortId = (value) => value ? value.slice(0, 8).toUpperCase() : '—';

function AuthPanel() {
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
        if (error) throw error;
        setMessage('Account request submitted. Check your email if confirmation is enabled, then sign in.');
        setMode('signin');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) { setMessage(error.message || 'Authentication failed'); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><div className="auth-brand"><div className="brand-mark">S</div><span>SAI BANK</span></div><section className="auth-card">
    <div className="eyebrow">YOUR DEMO BANKING SPACE</div><h1>{mode === 'signin' ? 'Welcome back.' : 'Create your account.'}</h1><p className="muted">Simple, secure demo banking with payment recovery.</p>
    <form onSubmit={submit}>
      {mode === 'signup' && <label>Full name<input required autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" /></label>}
      <label>Email address<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
      <label>Password<input required type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" /></label>
      <button className="primary full" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
    </form>
    {message && <div className="notice">{message}</div>}
    <p className="auth-switch">{mode === 'signin' ? "New to SAI Bank?" : 'Already registered?'} <button className="text-button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(''); }}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</button></p>
  </section><p className="fineprint">Educational demo only. Not a real bank or payment service.</p></main>;
}

function BalancePin({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  function unlock(e) { e.preventDefault(); if (pin.length !== 4) { setError('Enter your 4-digit demo PIN.'); return; } sessionStorage.setItem('sai_demo_balance_pin', pin); onUnlock(); }
  return <div className="pin-wall"><div className="pin-lock">⌑</div><h2>Balance protected</h2><p className="muted">Enter your 4-digit demo PIN to show your balance.</p><form onSubmit={unlock}><input aria-label="4 digit PIN" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} type="password" value={pin} onChange={e => {setPin(e.target.value.replace(/\D/g,'').slice(0,4)); setError('');}} placeholder="••••" /><button className="primary">Unlock balance</button></form>{error && <p className="error-text">{error}</p>}<p className="fineprint">This is a UI convenience only, not banking-grade PIN authentication.</p></div>;
}

function AppDashboard({ session }) {
  const [profile, setProfile] = useState(null);
  const [account, setAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [people, setPeople] = useState([]);
  const [showBalance, setShowBalance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState('home');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [recovering, setRecovering] = useState('');
  const [query, setQuery] = useState('');
  const [recipientFocused, setRecipientFocused] = useState(false);

  const user = session.user;
  const name = profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Customer';
  const firstName = name.split(/\s+/)[0];
  const recipientMatches = people.filter(p => {
    const search = recipient.trim().toLowerCase();
    return search && (String(p.account_number || '').toLowerCase().includes(search) || String(p.full_name || '').toLowerCase().includes(search));
  }).slice(0, 6);

  async function loadAll() {
    setLoading(true); setError('');
    try {
      const { data: prof, error: profErr } = await supabase.from('banking_profiles').select('user_id,full_name,email,role').eq('user_id', user.id).maybeSingle();
      if (profErr) throw profErr;
      setProfile(prof);
      const { data: accounts, error: accountErr } = await supabase.from('bank_accounts').select('account_id,account_number,currency,balance,status,recovery_debt,created_at').eq('user_id', user.id).order('created_at');
      if (accountErr) throw accountErr;
      setAccount(accounts?.[0] || null);
      const { data: txs, error: txErr } = await supabase.from('bank_transactions').select('transaction_id,from_account_id,to_account_id,amount,currency,transaction_type,status,reference,created_at,completed_at').or('from_account_id.not.is.null,to_account_id.not.is.null').order('created_at', { ascending: false }).limit(100);
      if (txErr) throw txErr;
      setTransactions((txs || []).filter(t => [accounts?.[0]?.account_id].includes(t.from_account_id) || [accounts?.[0]?.account_id].includes(t.to_account_id)));
      const { data: others, error: othersErr } = await supabase.from('bank_accounts').select('account_id,account_number,user_id,status,currency').neq('user_id', user.id).eq('status','active').limit(100);
      if (othersErr) throw othersErr;
      const otherUserIds = [...new Set((others || []).map(p => p.user_id).filter(Boolean))];
      let profileNames = new Map();
      if (otherUserIds.length) {
        const { data: profiles, error: profilesErr } = await supabase.from('banking_profiles').select('user_id,full_name').in('user_id', otherUserIds);
        if (profilesErr) throw profilesErr;
        profileNames = new Map((profiles || []).map(p => [p.user_id, p.full_name]));
      }
      setPeople((others || []).map(p => ({ ...p, full_name: profileNames.get(p.user_id) || 'SAI Bank user' })));
    } catch (e) { setError(e.message || 'Unable to load account data. Check the database schema and RLS policies.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadAll(); }, [user.id]);
  useEffect(() => {
    const channel = supabase.channel('sai-bank-live-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_accounts', filter: 'user_id=eq.' + user.id }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_transactions' }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user.id]);

  const myTransactions = useMemo(() => transactions.filter(t => (!query || (t.reference || '').toLowerCase().includes(query.toLowerCase()) || t.transaction_type.includes(query.toLowerCase()))), [transactions, query]);
  const accountById = useMemo(() => new Map([[account?.account_id, { account_number: account?.account_number, user_id: user.id }], ...people.map(p => [p.account_id, p])]), [account, people, user.id]);

  async function sendMoney(e) {
    e.preventDefault(); setError(''); setToast('');
    const target = people.find(p => p.account_number === recipient.trim());
    if (!account) { setError('Your SAI Bank account has not been created yet.'); return; }
    if (!target) { setError('Recipient account number not found. Ask the other demo user for their account number.'); return; }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) { setError('Enter an amount greater than zero.'); return; }
    if (!showBalance) { setError('Unlock the balance with your demo PIN before sending money.'); return; }
    setSending(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc('transfer_money', {
        p_from_account: account.account_id,
        p_to_account: target.account_id,
        p_amount: numericAmount,
        p_idempotency_key: crypto.randomUUID()
      });
      if (rpcErr) throw rpcErr;
      setToast('Transfer completed. Reference: ' + shortId(data?.transaction_id));
      setRecipient(''); setAmount(''); setDescription(''); setTab('history');
      await loadAll();
    } catch (e) { setError(e.message || 'Transfer failed'); }
    finally { setSending(false); }
  }

  async function recover(tx) {
    const ok = window.confirm('Recover ' + money(tx.amount, tx.currency) + ' to your account? This action is available only once within 24 hours and will freeze the recipient account if its balance is insufficient.');
    if (!ok) return;
    setError(''); setToast(''); setRecovering(tx.transaction_id);
    try {
      const { data, error: rpcErr } = await supabase.rpc('reverse_transaction', { p_transaction_id: tx.transaction_id });
      if (rpcErr) throw rpcErr;
      setToast(data?.message || 'Recovery completed.');
      await loadAll();
    } catch (e) { setError(e.message || 'Could not recover this transfer'); }
    finally { setRecovering(''); }
  }

  async function logout() { await supabase.auth.signOut(); }
  const canRecover = (tx) => tx.from_account_id === account?.account_id && tx.transaction_type === 'transfer' && tx.status === 'completed' && Date.now() - new Date(tx.created_at).getTime() <= 24 * 60 * 60 * 1000;

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand-row"><div className="brand-mark">S</div><div><strong>SAI BANK</strong><small>Personal banking</small></div></div>
      <div className="side-label">MENU</div>
      <button className={'nav-item ' + (tab==='home'?'active':'')} onClick={() => setTab('home')}><span>▦</span> Overview</button>
      <button className={'nav-item ' + (tab==='send'?'active':'')} onClick={() => setTab('send')}><span>↗</span> Send money</button>
      <button className={'nav-item ' + (tab==='history'?'active':'')} onClick={() => setTab('history')}><span>◷</span> Payment history</button>
      <div className="sidebar-bottom"><div className="secure-badge"> <span>✓</span> Demo environment</div><button className="nav-item" onClick={logout}><span>↪</span> Sign out</button></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><div className="eyebrow">SAI BANK · YOUR MONEY, YOUR CONTROL</div><h1>{tab==='home' ? 'Overview' : tab==='send' ? 'Send money' : 'Payment history'}</h1></div><div className="topbar-actions"><div className="user-pill"><div className="avatar">{firstName.slice(0,1).toUpperCase()}</div><div><b>{name}</b><small>{user.email}</small></div></div><button className="logout-button" onClick={logout} title="Sign out">↪ <span>Logout</span></button></div></header>
      {error && <div className="alert error"><span>!</span><div>{error}</div><button onClick={() => setError('')}>×</button></div>}
      {toast && <div className="alert success"><span>✓</span><div>{toast}</div><button onClick={() => setToast('')}>×</button></div>}
      {loading ? <div className="loading">Loading your SAI Bank account…</div> : !account ? <section className="empty-state"><div className="empty-icon">＋</div><h2>Your bank account isn't set up yet</h2><p>Authentication is working, but no bank_accounts row was found for your user. Ask the project owner to verify the profile/account-creation trigger.</p><button className="secondary" onClick={loadAll}>Try again</button></section> : <>
      {tab==='home' && <><section className="welcome-row"><div><h2>Good day, {firstName} <span>✦</span></h2><p>Here’s what’s happening with your account today.</p></div><button className="primary" onClick={() => setTab('send')}>＋ Send money</button></section>
      <section className="summary-grid"><div className="balance-card"><div className="balance-top"><span>Total available balance</span><span className="balance-symbol">◉</span></div>
        {showBalance ? <div className="balance-value">{money(account.balance, account.currency)}</div> : <div className="balance-value obscured">••••••••</div>}
        <div className="balance-bottom"><div><small>ACCOUNT NUMBER</small><b>{account.account_number}</b></div><button className="balance-toggle" onClick={() => setShowBalance(!showBalance)}>{showBalance ? 'Hide balance' : 'Enter PIN / Show'}</button></div>
        {account.status==='frozen' && <div className="frozen-note">Account frozen — new transfers are blocked until recovery debt is settled.</div>}
        {Number(account.recovery_debt||0)>0 && <div className="frozen-note">Recovery debt: {money(account.recovery_debt,account.currency)}. Incoming demo credits must repay this before funds become available.</div>}
      </div><div className="stat-card"><div className="stat-head"><span>Completed transactions</span><span className="stat-icon">↔</span></div><strong>{transactions.filter(t => t.status==='completed' || t.status==='reversed').length}</strong><p>Latest activity in your account</p><button className="subtle-link" onClick={() => setTab('history')}>View history →</button></div></section>
      {!showBalance && <section className="inline-pin"><div><b>Balance is hidden</b><p>Use your 4-digit demo PIN before showing the balance or sending funds.</p></div><BalancePin onUnlock={() => setShowBalance(true)} /></section>}
      <section className="panel"><div className="panel-heading"><div><h3>Recent transactions</h3><p>Review transfers and recover a wrong payment within 24 hours.</p></div><button className="subtle-link" onClick={() => setTab('history')}>See all →</button></div><TransactionList rows={transactions.slice(0,5)} account={account} userId={user.id} accountById={accountById} canRecover={canRecover} onRecover={recover} recovering={recovering}/></section></>}
      {tab==='send' && <section className="transfer-layout"><div className="panel transfer-panel"><div className="panel-heading"><div><h3>Send a payment</h3><p>Demo transfers between SAI Bank users.</p></div><div className="send-icon">↗</div></div><form onSubmit={sendMoney} className="transfer-form"><label className="recipient-field">Recipient <span className="label-hint">Search by name or account number</span><input required autoComplete="off" value={recipient} onFocus={() => setRecipientFocused(true)} onBlur={() => setTimeout(() => setRecipientFocused(false), 160)} onChange={e=>setRecipient(e.target.value)} placeholder="Start typing a name or account number…" aria-autocomplete="list" aria-expanded={recipientFocused && recipientMatches.length > 0} />{recipientFocused && recipient.trim() && <div className="recipient-suggestions" role="listbox">{recipientMatches.length ? recipientMatches.map(p => <button type="button" key={p.account_id} className="recipient-suggestion" onMouseDown={e => e.preventDefault()} onClick={() => {setRecipient(p.account_number); setRecipientFocused(false);}}><span className="recipient-avatar">{(p.full_name || 'U').slice(0,1).toUpperCase()}</span><span className="recipient-person"><b>{p.full_name}</b><small>Account · {p.account_number}</small></span><span className="suggestion-arrow">↗</span></button>) : <div className="no-suggestions">No matching active SAI Bank account.</div>}</div>}</label><label>Amount (INR)<div className="amount-input"><span>₹</span><input required type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" /></div></label><label>Payment note (optional)<input value={description} onChange={e=>setDescription(e.target.value)} maxLength={150} placeholder="What is this payment for?" /></label><div className="info-note"><b>24-hour recovery window</b><p>After a successful transfer, open Payment history and select “Oops, I made a wrong payment” if this was sent by mistake.</p></div><button disabled={sending || !showBalance} className="primary full">{sending ? 'Processing transfer…' : 'Confirm demo payment'}</button>{!showBalance && <p className="field-hint">Unlock balance with your demo PIN from Overview first.</p>}</form></div><div className="panel how-panel"><h3>How recovery works</h3><div className="step"><span>1</span><div><b>Send a payment</b><p>Transfers are recorded atomically in Supabase Postgres.</p></div></div><div className="step"><span>2</span><div><b>Request recovery</b><p>Within 24 hours, use the action in your transaction history.</p></div></div><div className="step"><span>3</span><div><b>Recover or freeze</b><p>The sender is credited. If the recipient has spent those funds, the account can go negative and freezes until debt is repaid.</p></div></div></div></section>}
      {tab==='history' && <section className="panel"><div className="panel-heading history-head"><div><h3>All transactions</h3><p>Your most recent 100 demo ledger entries.</p></div><input className="search-input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search history…" /></div><TransactionList rows={myTransactions} account={account} userId={user.id} accountById={accountById} canRecover={canRecover} onRecover={recover} recovering={recovering}/></section>}
      </>}
      <footer className="footer">SAI Bank App · Supabase demo · No real money is moved</footer>
    </main>
  </div>;
}

function TransactionList({ rows, account, userId, accountById, canRecover, onRecover, recovering }) {
  if (!rows.length) return <div className="empty-list"><span>◷</span><b>No transactions yet</b><p>Your transfers will appear here.</p></div>;
  return <div className="transaction-list"><div className="tx-table-head"><span>TRANSACTION</span><span>DATE</span><span>STATUS / ACTION</span><span className="right">AMOUNT</span></div>{rows.map(tx => {
    const outgoing = tx.from_account_id === account?.account_id;
    const title = tx.transaction_type==='reversal' ? 'Payment recovery' : tx.transaction_type==='deposit' ? 'Deposit' : tx.transaction_type==='withdrawal' ? 'Withdrawal' : outgoing ? 'Money sent' : 'Money received';
    const relatedId = outgoing ? tx.to_account_id : tx.from_account_id;
    const related = accountById.get(relatedId);
    const isReversal = tx.transaction_type==='reversal';
    const created = new Date(tx.created_at);
    const hoursLeft = Math.max(0, 24-(Date.now()-created.getTime())/3600000);
    const eligible = canRecover(tx);
    return <div className="tx-row" key={tx.transaction_id}><div className="tx-description"><div className={'tx-icon '+(isReversal?'reversal':outgoing?'outgoing':'incoming')}>{isReversal?'↶':outgoing?'↗':'↙'}</div><div><b>{title}</b><small>{outgoing ? 'To' : 'From'} account · {related?.account_number || shortId(relatedId)} {tx.reference && tx.reference!=='P2P transfer' ? ' · '+tx.reference : ''}</small></div></div>
      <div className="tx-date">{created.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}<small>{created.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</small></div>
      <div className="tx-status-wrap"><span className={'status-pill '+tx.status}>{tx.status}</span>{eligible && <div className="recovery-action"><button disabled={!!recovering} onClick={() => onRecover(tx)}>{recovering===tx.transaction_id?'Recovering…':'Oops, I made a wrong payment'}</button><small>{hoursLeft.toFixed(1)}h remaining</small></div>}</div>
      <div className={'tx-amount '+(outgoing?'negative':'positive')}>{outgoing?'−':'+'}{money(tx.amount,tx.currency)}</div>
    </div>;
  })}</div>;
}

export function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    if (!supabase) { setChecking(false); return; }
    supabase.auth.getSession().then(({data}) => {setSession(data.session); setChecking(false);});
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.unsubscribe();
  }, []);
  if (configError) return <main className="config-page"><div className="brand-mark">S</div><h1>Connect SAI Bank to Supabase</h1><p>{configError}</p><ol><li>Copy <code>.env.example</code> to <code>.env.local</code>.</li><li>Set your Supabase project URL and publishable/anon key.</li><li>Run <code>npm install</code> then <code>npm run dev</code>.</li></ol><p className="fineprint">Never place a service-role key in browser code.</p></main>;
  if (checking) return <div className="splash"><div className="brand-mark">S</div><p>Loading SAI Bank…</p></div>;
  return session ? <AppDashboard session={session}/> : <AuthPanel/>;
}
