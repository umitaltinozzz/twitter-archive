'use client';
import { useState } from 'react';

interface TweetData {
  id: string;
  type: string;
  url: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string | null;
  text: string;
  createdAt: string;
  media: string | null;
  isReply: boolean;
  tags: string | null;
  projectName: string | null;
  notes: string | null;
  quotedTweet: string | null; // Yeni alan
  isArchived: boolean;
  updatedAt: string;
  addedAt: string;
  parentId: string | null;
  children: TweetData[];
}

export default function DashboardClient({ initialTweets }: { initialTweets: TweetData[] }) {
  const [tweets, setTweets] = useState<TweetData[]>(initialTweets);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>('Hepsi');
  const [selectedType, setSelectedType] = useState<'all' | 'bookmark' | 'like' | 'manuel' | 'thread'>('all');
  
  // Yeni Tweet Ekleme State
  const [isAdding, setIsAdding] = useState(false);
  const [newTweetUrl, setNewTweetUrl] = useState('');
  const [newTweetText, setNewTweetText] = useState('');
  const [newTweetProject, setNewTweetProject] = useState('');
  const [newTweetTag, setNewTweetTag] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  
  // Not düzenleme State (hangi tweet'in not paneli açık?)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  
  // Thread ekleme State (hangi tweete thread ekleniyor?)
  const [addingThreadToId, setAddingThreadToId] = useState<string | null>(null);
  const [threadText, setThreadText] = useState('');
  const [threadUrl, setThreadUrl] = useState('');
  const [threadFile, setThreadFile] = useState<File | null>(null);
  
  // Thread görüntüleme State (hangi tweetlerin thread'i açık?)
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());

  const allProjects = Array.from(new Set(tweets.map(t => t.projectName).filter(Boolean))) as string[];

  // Tip sayıları (filter butonlarındaki rozetler için)
  const typeCounts = {
    all: tweets.length,
    bookmark: tweets.filter(t => t.type === 'bookmark').length,
    like: tweets.filter(t => t.type === 'like').length,
    manuel: tweets.filter(t => t.type === 'manuel').length,
  };

  const filteredTweets = tweets.filter(t => {
    const matchesSearch =
      t.text?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.tags?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.authorName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.projectName?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesProject = selectedProject === 'Hepsi' || t.projectName === selectedProject;
    const matchesType = selectedType === 'all' || t.type === selectedType;

    return matchesSearch && matchesProject && matchesType;
  });

  const handleDelete = async (id: string) => {
    if(!confirm('Bu gönderiyi arşivden silmek istediğine emin misin?')) return;
    const res = await fetch(`/api/tweets/${id}`, { method: 'DELETE' });
    if(res.ok) {
      setTweets(prev => prev.filter(t => t.id !== id));
    }
  };

  const handleDeleteChild = async (parentId: string, childId: string) => {
    if(!confirm('Bu thread parçasını silmek istediğine emin misin?')) return;
    const res = await fetch(`/api/tweets/${childId}`, { method: 'DELETE' });
    if(res.ok) {
      setTweets(prev => prev.map(t => 
        t.id === parentId 
          ? { ...t, children: t.children.filter(c => c.id !== childId) } 
          : t
      ));
    }
  };

  const handleUpdate = async (id: string, updates: Record<string, unknown>) => {
    const res = await fetch(`/api/tweets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
      headers: { 'Content-Type': 'application/json' }
    });
    if(res.ok) {
      const data = await res.json();
      setTweets(prev => prev.map(t => t.id === id ? { ...t, ...data.tweet } : t));
    }
  };

  const submitNewTweet = async () => {
    const mediaArray: { type: string; url: string; original: string }[] = [];
    if (uploadFile) {
      const formData = new FormData();
      formData.append('file', uploadFile);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const uploadData = await res.json();
        mediaArray.push({ type: uploadData.type, url: uploadData.url, original: uploadData.url });
      }
    }
    const payload = {
      url: newTweetUrl,
      text: newTweetText,
      projectName: newTweetProject || null,
      tags: newTweetTag || null,
      media: mediaArray.length > 0 ? mediaArray : null
    };
    const res = await fetch('/api/tweets', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });
    if(res.ok) {
      const data = await res.json();
      setTweets(prev => [{ ...data.tweet, children: [] }, ...prev]);
      setIsAdding(false);
      setNewTweetText(''); setNewTweetUrl(''); setNewTweetProject(''); setNewTweetTag(''); setUploadFile(null);
    }
  };

  const submitThreadPart = async (parentId: string, parentAuthor: string, parentUsername: string) => {
    const mediaArray: { type: string; url: string; original: string }[] = [];
    if (threadFile) {
      const formData = new FormData();
      formData.append('file', threadFile);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const uploadData = await res.json();
        mediaArray.push({ type: uploadData.type, url: uploadData.url, original: uploadData.url });
      }
    }
    const payload = {
      parentId,
      text: threadText,
      url: threadUrl || '',
      authorName: parentAuthor,
      authorUsername: parentUsername,
      media: mediaArray.length > 0 ? mediaArray : null,
    };
    const res = await fetch('/api/tweets', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });
    if(res.ok) {
      const data = await res.json();
      setTweets(prev => prev.map(t => 
        t.id === parentId 
          ? { ...t, children: [...t.children, { ...data.tweet, children: [] }] } 
          : t
      ));
      setAddingThreadToId(null);
      setThreadText(''); setThreadUrl(''); setThreadFile(null);
      setExpandedThreads(prev => new Set(prev).add(parentId));
    }
  };

  const toggleThread = (id: string) => {
    setExpandedThreads(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const renderMedia = (mediaStr: string | null) => {
    if (!mediaStr) return null;
    const media = JSON.parse(mediaStr);
    if (!media || media.length === 0) return null;
    return (
      <div className="media-container">
        {media.map((item: { type: string; url: string; original?: string; thumbnail?: string }, i: number) => {
          const src = item.original || item.thumbnail || item.url;
          if (item.type === 'photo') return <img key={i} src={src} alt="" style={{ maxHeight: '300px', objectFit: 'cover' }} />;
          if (item.type === 'video' || item.type === 'animated_gif') return (
            <video 
              key={i} 
              controls 
              playsInline 
              muted
              style={{ width: '100%', borderRadius: '12px', backgroundColor: '#000', maxHeight: '350px', display: 'block', marginTop: '0.8rem' }} 
              preload="metadata" 
              poster={item.thumbnail?.startsWith('http') ? item.thumbnail : undefined}
            >
              <source src={src} type="video/mp4" />
              Tarayıcınız video etiketini desteklemiyor.
            </video>
          );
          return null;
        })}
      </div>
    );
  };

  return (
    <main className="container">
      <header>
        <h1>X (Twitter) Arşivim</h1>
        <p style={{ color: 'var(--text-muted)' }}>Maliyet gerektirmeyen tamamen kişisel özel arşiviniz.</p>
        <button onClick={() => setIsAdding(!isAdding)} style={{ marginTop: '1rem', padding: '0.8rem 1.5rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '1rem', fontWeight: 500 }}>
          {isAdding ? 'İptal Et' : '+ Yeni Manuel Gönderi Ekle'}
        </button>
      </header>

      {isAdding && (
        <div style={{ background: 'var(--panel-bg)', padding: '2rem', borderRadius: '12px', marginBottom: '2rem', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(16px)' }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>Manuel Gönderi Ekle</h2>
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
            <input type="text" placeholder="Gönderi Linki (URL)" value={newTweetUrl} onChange={(e) => setNewTweetUrl(e.target.value)} className="search-input" />
            <input type="text" placeholder="Proje / Sınıf Adı" value={newTweetProject} onChange={(e) => setNewTweetProject(e.target.value)} className="search-input" />
            <input type="text" placeholder="Etiketler (Virgülle Ayırın)" value={newTweetTag} onChange={(e) => setNewTweetTag(e.target.value)} className="search-input" />
            <input type="file" accept="image/*,video/*" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="search-input" style={{ padding: '0.6rem' }}/>
            <textarea placeholder="Gönderi Metni veya Notun..." value={newTweetText} onChange={(e) => setNewTweetText(e.target.value)} className="search-input" style={{ gridColumn: '1 / -1', minHeight: '100px', borderRadius: '12px', resize: 'vertical' }}></textarea>
            <button onClick={submitNewTweet} style={{ gridColumn: '1 / -1', padding: '1rem', background: 'var(--success)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '1rem', fontWeight: 600 }}>
              Kaydet ve Arşive Ekle
            </button>
          </div>
        </div>
      )}

      <div className="controls" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <input type="text" placeholder="İçerik, yazar, proje veya etiketlerde ara..." className="search-input" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        <select className="search-input" value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} style={{ width: 'auto', minWidth: '180px', cursor: 'pointer' }}>
          <option value="Hepsi">📁 Tüm Projeler ({tweets.length})</option>
          {allProjects.map(p => <option key={p} value={p}>📂 {p} ({tweets.filter(t => t.projectName === p).length})</option>)}
        </select>
      </div>

      {/* Tip filtresi: Bookmarks / Likes / Manuel */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center', margin: '1rem 0 0.5rem' }}>
        {([
          { key: 'all', label: 'Tümü', emoji: '🗂️', count: typeCounts.all },
          { key: 'bookmark', label: 'Bookmarks', emoji: '🔖', count: typeCounts.bookmark },
          { key: 'like', label: 'Beğeniler', emoji: '❤️', count: typeCounts.like },
          { key: 'manuel', label: 'Manuel', emoji: '✏️', count: typeCounts.manuel },
        ] as const).map(opt => {
          const active = selectedType === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => setSelectedType(opt.key)}
              style={{
                padding: '0.5rem 1rem',
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? '#fff' : 'var(--text)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: '999px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                fontWeight: active ? 600 : 400,
                transition: 'all 0.15s ease',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <span>{opt.emoji}</span>
              <span>{opt.label}</span>
              <span style={{ opacity: 0.7, fontSize: '0.8rem' }}>({opt.count})</span>
            </button>
          );
        })}
      </div>

      {allProjects.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center', margin: '1rem 0' }}>
          <button onClick={() => setSelectedProject('Hepsi')} className="tag" style={{ cursor: 'pointer', background: selectedProject === 'Hepsi' ? 'var(--accent)' : undefined, color: selectedProject === 'Hepsi' ? '#fff' : undefined, border: 'none', fontFamily: 'inherit' }}>Hepsi</button>
          {allProjects.map(p => (
            <button key={p} onClick={() => setSelectedProject(p)} className="tag" style={{ cursor: 'pointer', background: selectedProject === p ? 'var(--accent)' : undefined, color: selectedProject === p ? '#fff' : undefined, border: 'none', fontFamily: 'inherit' }}>
              📁 {p} ({tweets.filter(t => t.projectName === p).length})
            </button>
          ))}
        </div>
      )}

      <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
        {filteredTweets.length} / {tweets.length} gönderi gösteriliyor
      </p>

      <div className="grid">
        {filteredTweets.map((tweet) => {
          const isNotePanelOpen = editingNoteId === tweet.id;
          const isThreadFormOpen = addingThreadToId === tweet.id;
          const isThreadExpanded = expandedThreads.has(tweet.id);
          const childCount = tweet.children?.length || 0;
          
          return (
            <article key={tweet.id} className="tweet-card" style={{ position: 'relative' }}>
              <button onClick={() => handleDelete(tweet.id)} title="Sil" style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(255,0,0,0.15)', color: '#ff6b6b', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', zIndex: 10, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>

              <div className="card-header">
                {tweet.authorAvatar && <img src={tweet.authorAvatar} alt="" className="avatar" />}
                <div className="author-info">
                  <span className="author-name">{tweet.authorName}</span>
                  <a 
                    href={tweet.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="author-handle" 
                    style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
                    onClick={(e) => e.stopPropagation()} // Kart tıklamasını engelle
                  >
                    @{tweet.authorUsername}
                  </a>
                </div>
              </div>
              
              <div 
                className="tweet-text" 
                style={{ lineHeight: 1.6, cursor: 'pointer' }}
                onClick={() => window.open(tweet.url, '_blank')}
              >
                {tweet.text}
              </div>

              {/* ── ALINTI TWEET (QUOTE TWEET) ── */}
              {tweet.quotedTweet && (
                <div 
                  className="quoted-container"
                  onClick={(e) => {
                    e.stopPropagation();
                    const q = JSON.parse(tweet.quotedTweet!);
                    window.open(`https://twitter.com/${q.authorUsername}/status/${q.id}`, '_blank');
                  }}
                  style={{ 
                    border: '1px solid var(--border)', 
                    borderRadius: '12px', 
                    padding: '0.8rem', 
                    marginTop: '0.8rem', 
                    background: 'rgba(255,255,255,0.02)',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    {JSON.parse(tweet.quotedTweet).authorAvatar && (
                      <img src={JSON.parse(tweet.quotedTweet).authorAvatar} alt="" style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
                    )}
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{JSON.parse(tweet.quotedTweet).authorName}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>@{JSON.parse(tweet.quotedTweet).authorUsername}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', lineHeight: 1.4 }}>
                    {JSON.parse(tweet.quotedTweet).text}
                  </div>
                  {renderMedia(JSON.parse(tweet.quotedTweet).media)}
                </div>
              )}

              {renderMedia(tweet.media)}

              {/* ── THREAD / FLOOD BÖLÜMÜ ── */}
              {childCount > 0 && (
                <button 
                  onClick={() => toggleThread(tweet.id)} 
                  style={{ width: '100%', padding: '0.5rem', background: 'rgba(29,161,242,0.08)', border: '1px solid rgba(29,161,242,0.2)', borderRadius: '8px', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                >
                  🧵 {isThreadExpanded ? 'Thread Parçalarını Gizle' : `Thread Parçalarını Göster (${childCount})`}
                </button>
              )}

              {isThreadExpanded && tweet.children?.map((child, idx) => (
                <div key={child.id} style={{ background: 'rgba(255,255,255,0.03)', borderLeft: '3px solid var(--accent)', padding: '0.8rem', borderRadius: '0 8px 8px 0', marginTop: idx === 0 ? '0.5rem' : '0.3rem', position: 'relative' }}>
                  <button onClick={() => handleDeleteChild(tweet.id, child.id)} style={{ position: 'absolute', top: '4px', right: '4px', background: 'transparent', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '0.7rem' }}>✕</button>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>🧵 Parça {idx + 1}</p>
                  <p style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>{child.text}</p>
                  {child.url && <a href={child.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: 'var(--accent)', display: 'block', marginTop: '0.3rem' }}>{child.url}</a>}
                  {renderMedia(child.media)}
                </div>
              ))}

              {/* Thread Ekleme Formu */}
              {isThreadFormOpen ? (
                <div style={{ background: 'rgba(29,161,242,0.05)', padding: '0.8rem', borderRadius: '8px', border: '1px dashed rgba(29,161,242,0.3)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600 }}>🧵 Flood/Thread Parçası Ekle</p>
                  <textarea placeholder="Eksik kalan thread metnini buraya yaz..." value={threadText} onChange={e => setThreadText(e.target.value)} style={{ width: '100%', minHeight: '60px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', padding: '0.5rem', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical' }} />
                  <input type="text" placeholder="Tweet Linki (opsiyonel)" value={threadUrl} onChange={e => setThreadUrl(e.target.value)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', padding: '0.4rem', fontSize: '0.85rem' }} />
                  <input type="file" accept="image/*,video/*" onChange={e => setThreadFile(e.target.files?.[0] || null)} style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }} />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => submitThreadPart(tweet.id, tweet.authorName, tweet.authorUsername)} style={{ flex: 1, padding: '0.5rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem' }}>Ekle</button>
                    <button onClick={() => { setAddingThreadToId(null); setThreadText(''); setThreadUrl(''); setThreadFile(null); }} style={{ padding: '0.5rem 1rem', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem' }}>İptal</button>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={() => { setAddingThreadToId(tweet.id); setExpandedThreads(prev => new Set(prev).add(tweet.id)); }}
                  style={{ width: '100%', padding: '0.4rem', background: 'transparent', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem' }}
                >
                  🧵 Eksik Thread/Flood Parçası Ekle
                </button>
              )}

              {/* Alt Yönetim Araçları */}
              <div style={{ marginTop: 'auto', paddingTop: '0.8rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>📁</span>
                  <input type="text" className="search-input" style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', flex: 1 }} placeholder="Proje adı yaz, Enter'a bas" defaultValue={tweet.projectName || ''} key={`proj-${tweet.id}-${tweet.projectName}`}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleUpdate(tweet.id, { projectName: e.currentTarget.value || null }); } }} />
                  {tweet.projectName && (
                    <button onClick={() => setSelectedProject(tweet.projectName!)} className="tag" style={{ cursor: 'pointer', background: 'rgba(29,161,242,0.15)', color: 'var(--accent)', border: 'none', fontFamily: 'inherit', whiteSpace: 'nowrap', fontSize: '0.75rem' }} title={`"${tweet.projectName}" projesini filtrele`}>
                      📂 {tweet.projectName}
                    </button>
                  )}
                </div>

                <div className="tags-section" style={{ borderTop: 'none', paddingTop: 0, alignItems: 'center' }}>
                  {tweet.tags ? tweet.tags.split(',').map((t: string) => t.trim()).filter(Boolean).map((t: string, idx: number) => (
                    <span key={idx} className="tag" style={{ cursor: 'pointer' }} onClick={() => setSearchTerm(t)}>#{t}</span>
                  )) : null}
                  <input type="text" placeholder="+ Etiket" style={{ background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', width: '80px' }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && e.currentTarget.value) { const newTags = tweet.tags ? `${tweet.tags}, ${e.currentTarget.value}` : e.currentTarget.value; handleUpdate(tweet.id, { tags: newTags }); e.currentTarget.value = ''; } }} />
                  <button onClick={() => setEditingNoteId(isNotePanelOpen ? null : tweet.id)} style={{ marginLeft: 'auto', background: tweet.notes ? 'rgba(46,160,67,0.15)' : 'transparent', border: '1px dashed var(--border)', color: tweet.notes ? 'var(--success)' : 'var(--text-muted)', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }} title="Not ekle">
                    {tweet.notes ? '📝 Notum' : '📝 Not Ekle'}
                  </button>
                  <span className="date" suppressHydrationWarning style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {new Date(tweet.createdAt).toLocaleDateString('tr-TR')}
                  </span>
                </div>

                {isNotePanelOpen && (
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <textarea placeholder="Bu gönderi hakkında kişisel notunu yaz..." defaultValue={tweet.notes || ''} style={{ width: '100%', minHeight: '60px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', padding: '0.5rem', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical' }}
                      onBlur={(e) => { if (e.target.value !== (tweet.notes || '')) handleUpdate(tweet.id, { notes: e.target.value }); }} />
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>Panelden çıkınca otomatik kaydedilir.</p>
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </main>
  );
}
