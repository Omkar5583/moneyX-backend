/**
 * MoneyX v4 - React Native Android App
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, TextInput, Alert, ActivityIndicator,
  PermissionsAndroid, Dimensions, SafeAreaView,
  Animated, Platform, NativeEventEmitter, NativeModules,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const BACKEND_URL = 'https://moneyx-backend-production.up.railway.app';

const C = {
  bg:'#060608',surface:'#0e0e14',surface2:'#14141e',border:'#1c1c2e',
  border2:'#252538',text:'#e8e8f0',muted:'#52526e',accent:'#6ee7b7',
  danger:'#f87171',warn:'#fbbf24',invest:'#60a5fa',purple:'#a78bfa',
};

const CAT_META = {
  'Food Delivery':{ color:'#fbbf24', icon:'🍔' },
  'Shopping':     { color:'#a78bfa', icon:'🛍️' },
  'Subscriptions':{ color:'#34d399', icon:'🔄' },
  'Groceries':    { color:'#4ade80', icon:'🛒' },
  'Investments':  { color:'#60a5fa', icon:'📈' },
  'Transport':    { color:'#fb923c', icon:'🚗' },
  'Others':       { color:'#94a3b8', icon:'📦' },
};

const CATEGORIES = Object.keys(CAT_META);
const fmt = (n) => 'Rs.' + Math.round(n || 0).toLocaleString('en-IN');

async function requestSMSPermission() {
  try {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    ]);
    return (
      granted[PermissionsAndroid.PERMISSIONS.READ_SMS] === 'granted' &&
      granted[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] === 'granted'
    );
  } catch { return false; }
}

async function requestNotificationPermission() {
  if (Platform.Version >= 33) {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    return granted === 'granted';
  }
  return true;
}

async function sendSMSToBackend(smsBody, userId) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: smsBody, timestamp: new Date().toISOString(), userId }),
    });
    return await res.json();
  } catch { return null; }
}

function showToast(title, body, setToast) {
  setToast({ title, body, visible: true });
  setTimeout(() => setToast(t => ({ ...t, visible: false })), 4000);
}

const ProgressBar = ({ value, max, color }) => {
  const pct = Math.min(((value || 0) / (max || 1)) * 100, 100);
  return (
    <View style={s.progressTrack}>
      <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
};

const StatCard = ({ label, value, color, sub }) => (
  <View style={[s.statCard, { flex: 1 }]}>
    <Text style={s.statLabel}>{label.toUpperCase()}</Text>
    <Text style={[s.statValue, { color }]}>{value}</Text>
    {sub && <Text style={s.statSub}>{sub}</Text>}
  </View>
);

const InsightCard = ({ type, icon, title, desc }) => {
  const colors = { danger:{bg:'#0d0505',border:'#3d1111'}, warning:{bg:'#0d0900',border:'#3d2200'}, success:{bg:'#040d08',border:'#0d2a14'}, info:{bg:'#040d1a',border:'#0d2240'} };
  const { bg, border } = colors[type] || colors.info;
  return (
    <View style={[s.insightCard, { backgroundColor: bg, borderColor: border }]}>
      <Text style={{ fontSize: 22 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.insightTitle}>{title}</Text>
        <Text style={s.insightDesc}>{desc}</Text>
      </View>
    </View>
  );
};

const TxnItem = ({ txn }) => {
  const meta = CAT_META[txn.category] || CAT_META['Others'];
  return (
    <View style={[s.txnItem, txn.isNew && { backgroundColor: '#04120a' }]}>
      <View style={[s.txnIcon, { backgroundColor: meta.color + '20' }]}>
        <Text style={{ fontSize: 16 }}>{meta.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={s.txnMerchant} numberOfLines={1}>{txn.merchant}</Text>
          {txn.isNew && <View style={s.liveBadge}><Text style={s.liveBadgeText}>NEW</Text></View>}
        </View>
        <Text style={s.txnMeta}>{txn.date} · <Text style={{ color: meta.color }}>{txn.category}</Text></Text>
      </View>
      <Text style={[s.txnAmt, { color: txn.category === 'Investments' ? C.invest : C.danger }]}>-{fmt(txn.amount)}</Text>
    </View>
  );
};

const Toast = ({ toast }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (toast.visible) { Animated.spring(anim, { toValue: 1, useNativeDriver: true }).start(); }
    else { Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }).start(); }
  }, [toast.visible]);
  return (
    <Animated.View style={[s.toast, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0,1], outputRange: [-80,0] }) }] }]}>
      <Text style={s.toastTitle}>{toast.title}</Text>
      <Text style={s.toastBody}>{toast.body}</Text>
    </Animated.View>
  );
};

const LandingScreen = ({ onConnect, onDemo }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <SafeAreaView style={[s.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], alignItems: 'center' }}>
        <View style={s.splashIcon}><Text style={s.splashIconText}>MX</Text></View>
        <Text style={s.landingTitle}>MoneyX</Text>
        <Text style={s.landingTagline}>Your money, fully automated.{'\n'}Zero effort. Total clarity.</Text>
        <View style={s.featureList}>
          {[
            { icon: '📱', text: 'Auto-captures bank & UPI SMS' },
            { icon: '🤖', text: 'AI categorizes every spend' },
            { icon: '💧', text: 'Detects money leaks instantly' },
            { icon: '🔔', text: 'Smart budget alerts' },
          ].map((f, i) => (
            <View key={i} style={s.featureRow}>
              <Text style={{ fontSize: 18 }}>{f.icon}</Text>
              <Text style={s.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity style={s.btnPrimary} onPress={onConnect}><Text style={s.btnPrimaryText}>🚀 Connect My Device</Text></TouchableOpacity>
        <TouchableOpacity style={[s.btnGhost, { marginTop: 12 }]} onPress={onDemo}><Text style={s.btnGhostText}>👀 View Demo</Text></TouchableOpacity>
        <Text style={s.landingFooter}>Free forever · No ads · Your data stays yours</Text>
      </Animated.View>
    </SafeAreaView>
  );
};

const OnboardingScreen = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [alertPref, setAlertPref] = useState('app');
  const [email, setEmail] = useState('');
  const [budgets, setBudgets] = useState({ 'Food Delivery':'4000','Shopping':'5000','Subscriptions':'600','Groceries':'2000','Transport':'1500','Others':'2000' });
  const [smsGranted, setSmsGranted] = useState(false);
  const [loading, setLoading] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const goNext = () => {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: -width, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: width, duration: 0, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
    setStep(s => s + 1);
  };

  const handleComplete = async () => {
    setLoading(true);
    const formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`;
    const userData = { name, phone: formattedPhone, alertPref, email, budgets: Object.fromEntries(Object.entries(budgets).map(([k,v]) => [k, +v||0])), smsGranted, setupComplete: true };
    await AsyncStorage.setItem('moneyxUser', JSON.stringify(userData));
    setLoading(false);
    onComplete(userData);
  };

  const steps = [
    <View key={0}>
      <Text style={s.stepTitle}>👋 Let's get started</Text>
      <Text style={s.stepSub}>Tell us about yourself</Text>
      <Text style={s.inputLabel}>Your Name</Text>
      <TextInput style={s.input} placeholder="e.g. Omkar" placeholderTextColor={C.muted} value={name} onChangeText={setName} />
      <Text style={[s.inputLabel,{marginTop:16}]}>Phone Number</Text>
      <TextInput style={s.input} placeholder="+91 98765 43210" placeholderTextColor={C.muted} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <TouchableOpacity style={[s.btnPrimary,{marginTop:32}]} onPress={() => { if (!name||!phone){Alert.alert('Required','Please enter name and phone');return;} goNext(); }}>
        <Text style={s.btnPrimaryText}>Continue →</Text>
      </TouchableOpacity>
    </View>,

    <View key={1}>
      <Text style={s.stepTitle}>🔔 How do you want alerts?</Text>
      <Text style={s.stepSub}>Choose how MoneyX notifies you</Text>
      {[
        { id:'app',icon:'📱',label:'In-App Notifications',desc:'Instant alerts on your phone. Free, no setup.' },
        { id:'whatsapp',icon:'💬',label:'WhatsApp',desc:`Alerts to ${phone||'your number'}.` },
        { id:'email',icon:'📧',label:'Email',desc:'Weekly digest to your email. Free.' },
        { id:'all',icon:'🔥',label:'All of the above',desc:'App + WhatsApp + Email alerts.' },
      ].map(opt => (
        <TouchableOpacity key={opt.id} style={[s.alertOption, alertPref===opt.id && s.alertOptionActive]} onPress={() => setAlertPref(opt.id)}>
          <Text style={{ fontSize:22 }}>{opt.icon}</Text>
          <View style={{ flex:1 }}>
            <Text style={[s.alertLabel, alertPref===opt.id && {color:C.accent}]}>{opt.label}</Text>
            <Text style={s.alertDesc}>{opt.desc}</Text>
          </View>
          {alertPref===opt.id && <Text style={{ color:C.accent, fontSize:18 }}>✓</Text>}
        </TouchableOpacity>
      ))}
      {(alertPref==='email'||alertPref==='all') && (
        <TextInput style={[s.input,{marginTop:12}]} placeholder="your@email.com" placeholderTextColor={C.muted} keyboardType="email-address" value={email} onChangeText={setEmail} />
      )}
      <TouchableOpacity style={[s.btnPrimary,{marginTop:24}]} onPress={goNext}><Text style={s.btnPrimaryText}>Continue →</Text></TouchableOpacity>
    </View>,

    <View key={2}>
      <Text style={s.stepTitle}>🎯 Set your monthly budgets</Text>
      <Text style={s.stepSub}>We'll alert you when you're close to limits</Text>
      {Object.entries(budgets).map(([cat,val]) => {
        const meta = CAT_META[cat]||CAT_META['Others'];
        return (
          <View key={cat} style={{ marginBottom:14 }}>
            <Text style={[s.inputLabel,{color:meta.color}]}>{meta.icon} {cat}</Text>
            <TextInput style={s.input} placeholder={`Budget for ${cat}`} placeholderTextColor={C.muted} keyboardType="numeric" value={val} onChangeText={v => setBudgets(b => ({...b,[cat]:v}))} />
          </View>
        );
      })}
      <TouchableOpacity style={[s.btnPrimary,{marginTop:16}]} onPress={goNext}><Text style={s.btnPrimaryText}>Continue →</Text></TouchableOpacity>
    </View>,

    <View key={3}>
      <Text style={s.stepTitle}>📱 Enable SMS Capture</Text>
      <Text style={s.stepSub}>MoneyX reads bank SMS to auto-track spending</Text>
      <View style={[s.card,{backgroundColor:'#040d08',borderColor:'#0d2a14',marginBottom:20}]}>
        {[['✅','Amount paid & merchant name'],['✅','Date & time of transaction'],['✅','UPI / Card / Net Banking'],['❌','Account numbers (never stored)'],['❌','OTP or PIN (never in SMS)'],['❌','Bank balance (always stripped)']].map(([icon,text],i) => (
          <View key={i} style={{ flexDirection:'row', gap:10, marginBottom:8 }}>
            <Text>{icon}</Text>
            <Text style={s.stepText}>{text}</Text>
          </View>
        ))}
      </View>
      {smsGranted ? (
        <View style={[s.card,{backgroundColor:'#040d08',borderColor:'#0d2a14',alignItems:'center'}]}>
          <Text style={{ fontSize:32, marginBottom:8 }}>✅</Text>
          <Text style={[s.stepTitle,{color:C.accent,textAlign:'center'}]}>SMS Permission Granted!</Text>
        </View>
      ) : (
        <TouchableOpacity style={s.btnPrimary} onPress={async () => {
          const granted = await requestSMSPermission();
          await requestNotificationPermission();
          setSmsGranted(granted);
          if (!granted) Alert.alert('Permission Denied','Go to Settings > Apps > MoneyX > Permissions');
        }}>
          <Text style={s.btnPrimaryText}>📱 Grant SMS Permission</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={[s.btnGhost,{marginTop:12}]} onPress={handleComplete}>
        {loading ? <ActivityIndicator color={C.accent} /> : <Text style={s.btnGhostText}>{smsGranted ? '🚀 Launch Dashboard' : 'Skip for now →'}</Text>}
      </TouchableOpacity>
    </View>,
  ];

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.progressHeader}>
        <TouchableOpacity onPress={() => step > 0 && setStep(p => p-1)}>
          <Text style={[s.backBtn, step===0 && {opacity:0}]}>← Back</Text>
        </TouchableOpacity>
        <View style={s.progressDots}>
          {[0,1,2,3].map(i => <View key={i} style={[s.dot, i===step && s.dotActive, i<step && s.dotDone]} />)}
        </View>
        <Text style={s.stepCount}>{step+1}/4</Text>
      </View>
      <ScrollView style={{ flex:1, padding:24 }} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>{steps[step]}</Animated.View>
        <View style={{ height:40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const Dashboard = ({ user, isDemo, onLogout }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [transactions, setTransactions] = useState(isDemo ? DEMO_TXN : []);
  const [toast, setToast] = useState({ visible:false, title:'', body:'' });
  const [manualMerchant, setManualMerchant] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualCat, setManualCat] = useState('Food Delivery');
  const [refreshing, setRefreshing] = useState(false);

  const budgets = user?.budgets || {};
  const catTotals = {};
  transactions.forEach(t => { catTotals[t.category] = (catTotals[t.category]||0) + t.amount; });
  const totalSpent = transactions.filter(t => t.category !== 'Investments').reduce((s,t) => s+t.amount, 0);
  const totalInvested = transactions.filter(t => t.category === 'Investments').reduce((s,t) => s+t.amount, 0);

  const fetchTransactions = async () => {
    if (isDemo) { showToast('👀 Demo Mode','Showing sample data only',setToast); return; }
    const userId = user?.phone;
    if (!userId) { showToast('⚠️ No phone number','Reset and complete onboarding',setToast); return; }
    setRefreshing(true);
    try {
      const url = `${BACKEND_URL}/api/transactions/${encodeURIComponent(userId)}`;
      const res = await fetch(url, { method:'GET', headers:{'Content-Type':'application/json'} });
      if (!res.ok) { showToast('❌ Server Error',`HTTP ${res.status} — try again`,setToast); setRefreshing(false); return; }
      const data = await res.json();
      if (data.transactions && data.transactions.length > 0) {
        const mapped = data.transactions.map((t,i) => ({
          id: t.id||i, merchant: t.merchant||'Unknown', amount: t.amount||0, category: t.category||'Others',
          date: new Date(t.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}),
          month: new Date(t.created_at).toLocaleString('en',{month:'short'}), isNew: false,
        }));
        setTransactions(mapped);
        showToast('✅ Refreshed!',`${mapped.length} transactions loaded`,setToast);
      } else {
        setTransactions([]);
        showToast('ℹ️ No transactions yet','Make a payment — it will appear here!',setToast);
      }
    } catch(e) { showToast('❌ Connection failed','Check internet and try again',setToast); }
    setRefreshing(false);
  };

  useEffect(() => { fetchTransactions(); }, []);

  useEffect(() => {
    if (user?.smsGranted && Platform.OS === 'android') {
      try {
        const emitter = new NativeEventEmitter(NativeModules.SmsRetriever);
        emitter.addListener('SmsReceived', async (event) => {
          const body = event.messageBody || '';
          if (/debited|credited|Rs\.|INR|UPI|payment|Dr\./i.test(body)) {
            const result = await sendSMSToBackend(body, user?.phone);
            if (result?.transaction) {
              const t = result.transaction;
              setTransactions(prev => [{ id:Date.now(), merchant:t.merchant, amount:t.amount, category:t.category, isNew:true, date:new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short'}), month:new Date().toLocaleString('en',{month:'short'}) }, ...prev]);
              const spent = (catTotals[t.category]||0) + t.amount;
              const budget = budgets[t.category];
              if (budget && spent > budget * 0.9) { showToast(`⚠️ ${t.category} Budget Alert!`,`${Math.round((spent/budget)*100)}% of budget used`,setToast); }
              else { showToast('💸 New Transaction',`${t.merchant} · ${fmt(t.amount)}`,setToast); }
            }
          }
        });
      } catch(e) { console.log('SMS listener error:',e); }
    }
  }, []);

  const addManual = () => {
    if (!manualMerchant||!manualAmount) { Alert.alert('Required','Enter merchant and amount'); return; }
    setTransactions(prev => [{ id:Date.now(), merchant:manualMerchant, amount:+manualAmount, category:manualCat, isNew:false, date:new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short'}), month:new Date().toLocaleString('en',{month:'short'}) }, ...prev]);
    setManualMerchant(''); setManualAmount('');
    showToast('✅ Added',`${manualMerchant} · ${fmt(+manualAmount)}`,setToast);
  };

  const tabs = [
    { id:'overview', label:'Overview', icon:'◈' },
    { id:'leaks',    label:'Leaks',    icon:'💧' },
    { id:'budget',   label:'Budget',   icon:'🎯' },
    { id:'history',  label:'History',  icon:'☰'  },
    { id:'settings', label:'Settings', icon:'⚙️' },
  ];

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <Toast toast={toast} />

      {/* HEADER */}
      <View style={s.header}>
        <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
          <View style={s.appLogo}><Text style={s.appLogoText}>MX</Text></View>
          <View>
            <Text style={s.headerTitle}>MoneyX {isDemo && <Text style={{ color:C.warn, fontSize:11 }}> DEMO</Text>}</Text>
            <Text style={s.headerSub}>Hi {user?.name||'there'} 👋</Text>
          </View>
        </View>
        <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
          <TouchableOpacity style={s.refreshBtn} onPress={fetchTransactions} activeOpacity={0.6}>
            {refreshing ? <ActivityIndicator size="small" color={C.accent} /> : <Text style={s.refreshIcon}>↻</Text>}
          </TouchableOpacity>
          <View style={s.livePill}>
            <View style={s.liveDot} />
            <Text style={s.livePillText}>{transactions.length} txns</Text>
          </View>
        </View>
      </View>

      {/* TABS */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={{ paddingHorizontal:10, paddingVertical:6 }}>
        {tabs.map(tab => (
          <TouchableOpacity key={tab.id} style={[s.tabBtn, activeTab===tab.id && s.tabBtnActive]} onPress={() => setActiveTab(tab.id)}>
            <Text style={[s.tabBtnText, activeTab===tab.id && s.tabBtnTextActive]}>{tab.icon} {tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={s.content} showsVerticalScrollIndicator={false}>

        {activeTab === 'overview' && (
          <View>
            <View style={s.row}>
              <StatCard label="Total Spent" value={fmt(totalSpent)} color={C.warn} sub="all categories" />
              <View style={{ width:10 }} />
              <StatCard label="Invested" value={fmt(totalInvested)} color={C.invest} sub="MF + SIP" />
            </View>
            <View style={s.row}>
              <StatCard label="Transactions" value={String(transactions.length)} color={C.accent} sub="auto captured" />
              <View style={{ width:10 }} />
              <StatCard label="Spend Ratio" value={`${Math.round(totalSpent/Math.max(totalInvested,1))}x`} color={C.danger} sub="spend vs invest" />
            </View>
            <View style={s.card}>
              <Text style={s.cardTitle}>Category Breakdown</Text>
              {Object.entries(catTotals).sort((a,b) => b[1]-a[1]).map(([cat,amt]) => {
                const meta = CAT_META[cat]||CAT_META['Others'];
                const pct = Math.round((amt/Math.max(totalSpent,1))*100);
                return (
                  <View key={cat} style={{ marginBottom:14 }}>
                    <View style={s.catRow}>
                      <Text style={s.catName}>{meta.icon} {cat}</Text>
                      <View style={{ flexDirection:'row', gap:8, alignItems:'center' }}>
                        <Text style={[s.catAmt,{color:meta.color}]}>{fmt(amt)}</Text>
                        <Text style={s.catPct}>{pct}%</Text>
                      </View>
                    </View>
                    <ProgressBar value={amt} max={totalSpent} color={meta.color} />
                  </View>
                );
              })}
              {transactions.length === 0 && (
                <View style={{ alignItems:'center', padding:24 }}>
                  <Text style={{ fontSize:36, marginBottom:10 }}>📭</Text>
                  <Text style={[s.muted,{textAlign:'center'}]}>No transactions yet!{'\n'}Make a payment — bank SMS{'\n'}will auto-appear here.</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {activeTab === 'leaks' && (
          <View>
            {transactions.length < 3 ? (
              <View style={[s.card,{alignItems:'center',padding:40}]}>
                <Text style={{ fontSize:40 }}>💧</Text>
                <Text style={[s.cardTitle,{textAlign:'center',marginTop:12}]}>Not enough data yet</Text>
                <Text style={[s.muted,{textAlign:'center'}]}>Add at least 3 transactions to see leak analysis.</Text>
              </View>
            ) : (
              <>
                <View style={[s.card,{backgroundColor:'#0d0505',borderColor:'#3d1111'}]}>
                  <Text style={[s.monoText,{color:C.danger,marginBottom:6}]}>ESTIMATED MONTHLY LEAK</Text>
                  <Text style={[s.leakAmount,{color:C.danger}]}>{fmt(Math.round(totalSpent*0.25))}</Text>
                  <Text style={s.muted}>~25% of spending is avoidable</Text>
                </View>
                {[
                  { type:'danger',  icon:'🚨', title:'Food Delivery spending high', desc:'Cook 2-3 days/week to save Rs.1,500+/month.' },
                  { type:'warning', icon:'🔄', title:'Check your subscriptions',    desc:'Review unused subscriptions and cancel them.' },
                  { type:'info',    icon:'💡', title:'Redirect savings to SIP',     desc:'Small savings in SIP can grow 12-15% annually.' },
                ].map((ins,i) => <InsightCard key={i} {...ins} />)}
              </>
            )}
          </View>
        )}

        {activeTab === 'budget' && (
          <View>
            <Text style={s.pageTitle}>Budget Tracker 🎯</Text>
            {Object.keys(budgets).length === 0 ? (
              <View style={[s.card,{alignItems:'center',padding:30}]}>
                <Text style={s.muted}>No budgets set. Reset app to add budgets during onboarding.</Text>
              </View>
            ) : (
              Object.entries(budgets).map(([cat,budget]) => {
                const spent = catTotals[cat]||0;
                const meta = CAT_META[cat]||CAT_META['Others'];
                const over = spent > budget;
                return (
                  <View key={cat} style={s.card}>
                    <View style={s.budgetRow}>
                      <View>
                        <Text style={s.budgetCat}>{meta.icon} {cat}</Text>
                        <Text style={s.muted}>Budget: {fmt(budget)}/mo</Text>
                      </View>
                      <View style={{ alignItems:'flex-end' }}>
                        <Text style={[s.budgetSpent,{color:over?C.danger:meta.color}]}>{fmt(spent)}</Text>
                        {over && <Text style={{ color:C.danger, fontSize:11 }}>+{fmt(spent-budget)} over!</Text>}
                      </View>
                    </View>
                    <ProgressBar value={spent} max={budget} color={over?C.danger:meta.color} />
                    <View style={s.budgetFooter}>
                      <Text style={s.muted}>{Math.round((spent/Math.max(budget,1))*100)}% used</Text>
                      <Text style={s.muted}>{fmt(Math.max(budget-spent,0))} left</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {activeTab === 'history' && (
          <View>
            <View style={s.card}>
              <Text style={[s.monoText,{color:C.accent,marginBottom:12}]}>+ ADD TRANSACTION MANUALLY</Text>
              <TextInput style={s.input} placeholder="Merchant name" placeholderTextColor={C.muted} value={manualMerchant} onChangeText={setManualMerchant} />
              <TextInput style={[s.input,{marginTop:8}]} placeholder="Amount" placeholderTextColor={C.muted} keyboardType="numeric" value={manualAmount} onChangeText={setManualAmount} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop:8 }}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity key={cat} style={[s.catChip, manualCat===cat && s.catChipActive]} onPress={() => setManualCat(cat)}>
                    <Text style={[s.catChipText, manualCat===cat && {color:'#051a10'}]}>{CAT_META[cat].icon} {cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={[s.btnPrimary,{marginTop:12}]} onPress={addManual}><Text style={s.btnPrimaryText}>Add Transaction</Text></TouchableOpacity>
            </View>
            <View style={[s.card,{padding:0,overflow:'hidden'}]}>
              <View style={{ padding:14, borderBottomWidth:1, borderBottomColor:C.border }}>
                <Text style={s.monoText}>ALL TRANSACTIONS ({transactions.length})</Text>
              </View>
              {transactions.length === 0
                ? <Text style={[s.muted,{textAlign:'center',padding:30}]}>No transactions yet.{'\n'}They appear automatically from bank SMS!</Text>
                : transactions.map(txn => <TxnItem key={txn.id} txn={txn} />)
              }
            </View>
          </View>
        )}

        {activeTab === 'settings' && (
          <View>
            <Text style={s.pageTitle}>Settings ⚙️</Text>
            <View style={s.card}>
              <Text style={[s.monoText,{color:C.muted,marginBottom:12}]}>YOUR PROFILE</Text>
              {[
                ['Name', user?.name],
                ['Phone', user?.phone],
                ['Alert Preference', user?.alertPref?.toUpperCase()],
                ['SMS Permission', user?.smsGranted ? '✅ Granted' : '❌ Not granted'],
                ['Total Transactions', String(transactions.length)],
                ['Total Spent', fmt(totalSpent)],
              ].map(([label,value]) => (
                <View key={label} style={s.settingRow}>
                  <Text style={s.settingLabel}>{label}</Text>
                  <Text style={[s.settingValue, label==='SMS Permission' && {color:user?.smsGranted?C.accent:C.danger}]}>{value||'—'}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity
              style={[s.card,{backgroundColor:'#0d0505',borderColor:'#3d1111',alignItems:'center'}]}
              onPress={() => Alert.alert('Reset MoneyX?','This will clear your local data and restart onboarding.',[
                {text:'Cancel',style:'cancel'},
                {text:'Reset',style:'destructive',onPress:onLogout},
              ])}>
              <Text style={{ color:C.danger, fontWeight:'700', fontSize:15 }}>🔄 Reset & Start Over</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height:40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const DEMO_TXN = [
  { id:1,  date:'12-Jan', merchant:'Swiggy',   amount:450,  category:'Food Delivery', month:'Jan', isNew:false },
  { id:2,  date:'13-Jan', merchant:'Amazon',   amount:1200, category:'Shopping',      month:'Jan', isNew:false },
  { id:3,  date:'14-Jan', merchant:'Netflix',  amount:299,  category:'Subscriptions', month:'Jan', isNew:false },
  { id:4,  date:'15-Jan', merchant:'Zomato',   amount:2400, category:'Food Delivery', month:'Jan', isNew:false },
  { id:5,  date:'16-Jan', merchant:'MF SIP',   amount:5000, category:'Investments',   month:'Jan', isNew:false },
  { id:6,  date:'03-Feb', merchant:'Swiggy',   amount:680,  category:'Food Delivery', month:'Feb', isNew:false },
  { id:7,  date:'10-Feb', merchant:'Myntra',   amount:4500, category:'Shopping',      month:'Feb', isNew:false },
  { id:8,  date:'04-Mar', merchant:'Blinkit',  amount:420,  category:'Groceries',     month:'Mar', isNew:false },
  { id:9,  date:'12-Mar', merchant:'Flipkart', amount:6200, category:'Shopping',      month:'Mar', isNew:false },
  { id:10, date:'20-Mar', merchant:'MF SIP',   amount:3800, category:'Investments',   month:'Mar', isNew:false },
];

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [user, setUser] = useState(null);
  useEffect(() => {
    AsyncStorage.getItem('moneyxUser').then(data => {
      if (data) { setUser(JSON.parse(data)); setScreen('dashboard'); }
      else setScreen('landing');
    }).catch(() => setScreen('landing'));
  }, []);
  const handleLogout = async () => { await AsyncStorage.removeItem('moneyxUser'); setUser(null); setScreen('landing'); };
  if (screen === 'loading') return (
    <SafeAreaView style={[s.container,{justifyContent:'center',alignItems:'center'}]}>
      <View style={s.splashIcon}><Text style={s.splashIconText}>MX</Text></View>
      <Text style={[s.headerTitle,{fontSize:32,marginTop:20}]}>MoneyX</Text>
      <ActivityIndicator color={C.accent} style={{ marginTop:20 }} />
    </SafeAreaView>
  );
  if (screen === 'landing') return <LandingScreen onConnect={() => setScreen('onboarding')} onDemo={() => { setUser({name:'Demo User',budgets:{'Food Delivery':4000,'Shopping':5000}}); setScreen('demo'); }} />;
  if (screen === 'onboarding') return <OnboardingScreen onComplete={u => { setUser(u); setScreen('dashboard'); }} />;
  if (screen === 'demo') return <Dashboard user={{name:'Demo User',budgets:{'Food Delivery':4000,'Shopping':5000}}} isDemo={true} onLogout={handleLogout} />;
  return <Dashboard user={user} isDemo={false} onLogout={handleLogout} />;
}

const s = StyleSheet.create({
  container:         { flex:1, backgroundColor:C.bg },
  splashIcon:        { width:100, height:100, borderRadius:24, backgroundColor:'#0d1f17', borderWidth:2, borderColor:C.accent, alignItems:'center', justifyContent:'center', marginBottom:10 },
  splashIconText:    { fontSize:36, color:C.accent, fontWeight:'900', letterSpacing:-1 },
  appLogo:           { width:38, height:38, borderRadius:10, backgroundColor:C.accent, alignItems:'center', justifyContent:'center' },
  appLogoText:       { fontSize:15, color:'#051a10', fontWeight:'900', letterSpacing:-0.5 },
  landingTitle:      { fontSize:42, fontWeight:'800', color:C.text, letterSpacing:-1, marginBottom:12 },
  landingTagline:    { fontSize:16, color:C.muted, textAlign:'center', lineHeight:24, marginBottom:32 },
  featureList:       { width:'100%', marginBottom:32 },
  featureRow:        { flexDirection:'row', alignItems:'center', gap:12, marginBottom:12, backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:12, padding:14 },
  featureText:       { fontSize:14, color:C.text },
  landingFooter:     { fontSize:11, color:C.muted, marginTop:16, textAlign:'center' },
  progressHeader:    { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:C.border },
  backBtn:           { fontSize:14, color:C.muted },
  progressDots:      { flexDirection:'row', gap:6 },
  dot:               { width:8, height:8, borderRadius:4, backgroundColor:C.border },
  dotActive:         { backgroundColor:C.accent, width:20 },
  dotDone:           { backgroundColor:C.accent+'60' },
  stepCount:         { fontSize:12, color:C.muted },
  stepTitle:         { fontSize:22, fontWeight:'800', color:C.text, marginBottom:8, letterSpacing:-0.5 },
  stepSub:           { fontSize:14, color:C.muted, marginBottom:20, lineHeight:20 },
  stepText:          { fontSize:13, color:C.muted, flex:1 },
  inputLabel:        { fontSize:11, color:C.muted, marginBottom:6, letterSpacing:0.5 },
  alertOption:       { flexDirection:'row', alignItems:'center', gap:12, backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:14, padding:14, marginBottom:8 },
  alertOptionActive: { borderColor:C.accent, backgroundColor:'#04120a' },
  alertLabel:        { fontSize:14, fontWeight:'700', color:C.text, marginBottom:2 },
  alertDesc:         { fontSize:12, color:C.muted },
  header:            { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:14, borderBottomWidth:1, borderBottomColor:C.border },
  headerTitle:       { fontSize:20, fontWeight:'800', color:C.accent, letterSpacing:-0.5 },
  headerSub:         { fontSize:11, color:C.muted, marginTop:1 },
  refreshBtn:        { width:36, height:36, borderRadius:10, backgroundColor:C.surface, borderWidth:1, borderColor:C.border2, alignItems:'center', justifyContent:'center' },
  refreshIcon:       { color:C.accent, fontSize:20, fontWeight:'700' },
  livePill:          { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:'#051a10', borderWidth:1, borderColor:C.accent, borderRadius:100, paddingHorizontal:8, paddingVertical:4 },
  liveDot:           { width:5, height:5, borderRadius:3, backgroundColor:C.accent },
  livePillText:      { fontSize:10, color:C.accent, fontWeight:'700' },
  tabBar:            { borderBottomWidth:1, borderBottomColor:C.border },
  tabBtn:            { paddingHorizontal:10, paddingVertical:5, borderRadius:100, borderWidth:1, borderColor:C.border, marginRight:6 },
  tabBtnActive:      { backgroundColor:C.accent, borderColor:C.accent },
  tabBtnText:        { fontSize:10, fontWeight:'600', color:C.muted },
  tabBtnTextActive:  { color:'#051a10' },
  content:           { flex:1, padding:12 },
  row:               { flexDirection:'row', marginBottom:10 },
  statCard:          { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:14, padding:14 },
  statLabel:         { fontSize:9, color:C.muted, letterSpacing:0.5, marginBottom:5 },
  statValue:         { fontSize:20, fontWeight:'800', letterSpacing:-0.5 },
  statSub:           { fontSize:10, color:C.muted, marginTop:3 },
  card:              { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:16, padding:16, marginBottom:12 },
  cardTitle:         { fontSize:15, fontWeight:'700', color:C.text, marginBottom:14 },
  catRow:            { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:6 },
  catName:           { fontSize:13, color:C.text },
  catAmt:            { fontSize:13, fontWeight:'700' },
  catPct:            { fontSize:11, color:C.muted },
  progressTrack:     { height:5, backgroundColor:C.border, borderRadius:100, overflow:'hidden' },
  progressFill:      { height:5, borderRadius:100 },
  insightCard:       { flexDirection:'row', gap:12, borderWidth:1, borderRadius:14, padding:14, marginBottom:10 },
  insightTitle:      { fontSize:14, fontWeight:'700', color:C.text, marginBottom:4 },
  insightDesc:       { fontSize:12, color:C.muted, lineHeight:18 },
  leakAmount:        { fontSize:28, fontWeight:'800', letterSpacing:-1 },
  txnItem:           { flexDirection:'row', alignItems:'center', gap:10, padding:13, borderBottomWidth:1, borderBottomColor:C.border },
  txnIcon:           { width:36, height:36, borderRadius:9, alignItems:'center', justifyContent:'center' },
  txnMerchant:       { fontSize:13, fontWeight:'700', color:C.text, maxWidth:width*0.38 },
  txnMeta:           { fontSize:11, color:C.muted, marginTop:2 },
  txnAmt:            { fontSize:13, fontWeight:'700' },
  liveBadge:         { backgroundColor:'#051a10', borderWidth:1, borderColor:C.accent, borderRadius:100, paddingHorizontal:5, paddingVertical:1 },
  liveBadgeText:     { fontSize:8, color:C.accent, fontWeight:'700' },
  input:             { backgroundColor:C.surface2, borderWidth:1, borderColor:C.border2, borderRadius:10, padding:12, color:C.text, fontSize:14 },
  btnPrimary:        { backgroundColor:C.accent, borderRadius:12, padding:16, alignItems:'center' },
  btnPrimaryText:    { color:'#051a10', fontWeight:'700', fontSize:15 },
  btnGhost:          { borderWidth:1, borderColor:C.border2, borderRadius:12, padding:16, alignItems:'center' },
  btnGhostText:      { color:C.muted, fontWeight:'600', fontSize:14 },
  pageTitle:         { fontSize:20, fontWeight:'800', color:C.text, marginBottom:14, letterSpacing:-0.5 },
  budgetRow:         { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 },
  budgetCat:         { fontSize:14, fontWeight:'700', color:C.text },
  budgetSpent:       { fontSize:15, fontWeight:'700' },
  budgetFooter:      { flexDirection:'row', justifyContent:'space-between', marginTop:6 },
  catChip:           { paddingHorizontal:9, paddingVertical:5, borderRadius:100, borderWidth:1, borderColor:C.border, marginRight:5 },
  catChipActive:     { backgroundColor:C.accent, borderColor:C.accent },
  catChipText:       { fontSize:10, color:C.muted },
  settingRow:        { flexDirection:'row', justifyContent:'space-between', paddingVertical:12, borderBottomWidth:1, borderBottomColor:C.border },
  settingLabel:      { fontSize:13, color:C.muted },
  settingValue:      { fontSize:13, color:C.text, fontWeight:'600', maxWidth:width*0.5, textAlign:'right' },
  monoText:          { fontSize:10, color:C.muted, letterSpacing:0.5 },
  muted:             { fontSize:13, color:C.muted, lineHeight:20 },
  toast:             { position:'absolute', top:60, left:14, right:14, backgroundColor:C.surface2, borderWidth:1, borderColor:C.accent, borderRadius:14, padding:14, zIndex:999 },
  toastTitle:        { fontSize:13, fontWeight:'700', color:C.text, marginBottom:3 },
  toastBody:         { fontSize:12, color:C.muted },
});
