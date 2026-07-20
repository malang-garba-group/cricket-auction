import React, { useState, useEffect } from 'react';
import PageHeader from '../components/PageHeader';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';

const AdminPage = () => {
  const [auctions, setAuctions] = useState([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [invitations, setInvitations] = useState([]);
  const [inviteMobile, setInviteMobile] = useState('');
  const [generating, setGenerating] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  useEffect(() => {
    const fetchAuctions = async () => {
      try {
        const { data, error } = await supabase
          .from('auctions')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setAuctions(data || []);
        
        // Initial selected code
        const saved = localStorage.getItem('cap_admin_selected_auction_code');
        if (saved && data.some(a => a.auction_code === saved)) {
          setSelectedCode(saved);
        } else if (data && data.length > 0) {
          setSelectedCode(data[0].auction_code);
          localStorage.setItem('cap_admin_selected_auction_code', data[0].auction_code);
        }
      } catch (err) {
        console.error("Error fetching auctions for admin:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAuctions();
  }, []);

  const fetchInvitations = async (auctionId) => {
    try {
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('auction_id', auctionId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setInvitations(data || []);
    } catch (err) {
      console.error("Error fetching invitations:", err);
    }
  };

  useEffect(() => {
    const activeAuction = auctions.find(a => a.auction_code === selectedCode);
    if (activeAuction) {
      fetchInvitations(activeAuction.id);
    } else {
      setInvitations([]);
    }
  }, [selectedCode, auctions]);

  const handleGenerateInvite = async (e) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    
    const activeAuction = auctions.find(a => a.auction_code === selectedCode);
    if (!activeAuction) return setInviteError('No active auction selected.');
    if (!inviteMobile.trim()) return setInviteError('Please enter a mobile number.');
    
    setGenerating(true);
    try {
      // Check if already exists in invitations
      const { data: existingInvite } = await supabase
        .from('invitations')
        .select('*')
        .eq('auction_id', activeAuction.id)
        .eq('mobile', inviteMobile.trim())
        .maybeSingle();

      if (existingInvite) {
        throw new Error('An invitation link for this mobile number already exists.');
      }

      // Insert new invitation
      const { data, error } = await supabase
        .from('invitations')
        .insert([{
          auction_id: activeAuction.id,
          mobile: inviteMobile.trim(),
          status: 'pending'
        }])
        .select()
        .single();

      if (error) throw error;

      setInviteSuccess('Invitation link generated successfully!');
      setInviteMobile('');
      await fetchInvitations(activeAuction.id);
    } catch (err) {
      console.error(err);
      setInviteError(err.message || 'Failed to generate invitation link.');
    } finally {
      setGenerating(false);
    }
  };

  const handleRevokeInvite = async (id) => {
    if (!window.confirm("Are you sure you want to revoke this invitation link? The player won't be able to register using it.")) return;
    try {
      const { error } = await supabase
        .from('invitations')
        .delete()
        .eq('id', id);
      if (error) throw error;
      
      const activeAuction = auctions.find(a => a.auction_code === selectedCode);
      if (activeAuction) await fetchInvitations(activeAuction.id);
    } catch (err) {
      console.error(err);
      alert('Failed to revoke invitation.');
    }
  };

  const handleCopyLink = (inviteId) => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}#/register?code=${selectedCode}&invite=${inviteId}`;
    navigator.clipboard.writeText(inviteUrl);
    alert('Invitation link copied to clipboard!');
  };

  const handleSelectAuction = (code) => {
    setSelectedCode(code);
    localStorage.setItem('cap_admin_selected_auction_code', code);
  };

  const handleLogout = () => {
    localStorage.removeItem('cap_admin_auth');
    localStorage.removeItem('cap_admin_selected_auction_code');
    window.location.reload();
  };

  const codeParam = selectedCode ? `?code=${selectedCode}` : '';

  return (
    <div className="flex-col min-h-screen">
      <div className="spotlight"></div>
      <PageHeader title="Admin Command Center" subtitle="Master Control Dashboard" showLogos={false} />
      
      <main className="container" style={{ padding: '2rem 1rem 4rem', zIndex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {/* Active Auction Selector Panel */}
        <div className="glass-panel" style={{ padding: '1.5rem 2rem', width: '100%', maxWidth: '1000px', marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', border: '1px solid rgba(255,215,0,0.2)' }}>
          <div>
            <h3 style={{ color: '#fff', margin: 0, fontSize: '1.1rem', letterSpacing: '1px', textTransform: 'uppercase' }}>Active Management Scope</h3>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.85rem' }}>Select which tournament dashboard you want to manage.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {loading ? (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading Auctions...</span>
            ) : auctions.length === 0 ? (
              <span style={{ color: '#ff4444', fontSize: '0.9rem', fontWeight: 'bold' }}>No Tournaments Found! Create one first.</span>
            ) : (
              <select
                value={selectedCode}
                onChange={(e) => handleSelectAuction(e.target.value)}
                style={{
                  padding: '0.6rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  color: 'var(--accent-gold)',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '2px solid var(--accent-gold)',
                  borderRadius: '6px',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                {auctions.map(a => (
                  <option key={a.id} value={a.auction_code} style={{ background: '#0a0f1d', color: '#fff' }}>
                    {a.auction_name} ({a.auction_code})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', width: '100%', maxWidth: '1000px', marginBottom: '4rem' }}>
          
          <Link to={`/auction${codeParam}`} className="glass-panel render-card" style={{ padding: '3rem 2rem', textAlign: 'center', textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div style={{ fontSize: '3.5rem' }}>🏆</div>
            <h3 style={{ color: 'var(--accent-gold)', margin: 0, fontSize: '1.5rem' }}>Manage Auctions</h3>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>Create and configure backend tournament properties.</p>
          </Link>

          <Link to={`/auction-teams${codeParam}`} className="glass-panel render-card" style={{ padding: '3rem 2rem', textAlign: 'center', textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div style={{ fontSize: '3.5rem' }}>🛡️</div>
            <h3 style={{ color: 'var(--accent-gold)', margin: 0, fontSize: '1.5rem' }}>Auction Teams</h3>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>Manage teams and assign Icon players.</p>
          </Link>

          <Link to={`/admin-players${codeParam}`} className="glass-panel render-card" style={{ padding: '3rem 2rem', textAlign: 'center', textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div style={{ fontSize: '3.5rem' }}>👥</div>
            <h3 style={{ color: 'var(--accent-green)', margin: 0, fontSize: '1.5rem' }}>Player Approvals</h3>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>Approve, reject, or delete submitted registration profiles.</p>
          </Link>

          <Link to={`/players${codeParam}`} className="glass-panel render-card" style={{ padding: '3rem 2rem', textAlign: 'center', textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div style={{ fontSize: '3.5rem' }}>📋</div>
            <h3 style={{ color: 'var(--text-main)', margin: 0, fontSize: '1.5rem' }}>Public Roster</h3>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>Preview the live public-facing grid of all approved players.</p>
          </Link>

          <Link to={`/live-auction${codeParam}`} className="glass-panel render-card" style={{ padding: '3rem 2rem', textAlign: 'center', textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div style={{ fontSize: '3.5rem' }}>🔥</div>
            <h3 style={{ color: '#ff4444', margin: 0, fontSize: '1.5rem' }}>Live Auction</h3>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>Run active bidding sessions and sell players to teams.</p>
          </Link>

          <Link to={`/team-details${codeParam}`} className="glass-panel render-card" style={{ padding: '3rem 2rem', textAlign: 'center', textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div style={{ fontSize: '3.5rem' }}>💰</div>
            <h3 style={{ color: 'var(--accent-green)', margin: 0, fontSize: '1.5rem' }}>Team & Purse</h3>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>Track team squads and remaining auction budget.</p>
          </Link>

        </div>

        {/* Tournament Invitation Hub */}
        {selectedCode && auctions.find(a => a.auction_code === selectedCode) && (
          <div className="glass-panel" style={{ padding: '2rem', width: '100%', maxWidth: '1000px', marginBottom: '3rem', border: '1px solid rgba(57,255,20,0.2)' }}>
            <h2 style={{ color: 'var(--accent-green)', margin: '0 0 0.5rem 0', fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              ✉️ Tournament Invitation Hub
            </h2>
            <p style={{ color: 'var(--text-muted)', margin: '0 0 2rem 0', fontSize: '0.9rem' }}>
              Create secure, single-use invite tokens linked to player mobile numbers. Standard registration is blocked unless a valid invite token is used.
            </p>

            <form onSubmit={handleGenerateInvite} style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end', marginBottom: '2rem', background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              <div style={{ flex: '1 1 250px' }}>
                <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block', color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 'bold' }}>Player Mobile Number</label>
                <input 
                  type="tel" 
                  value={inviteMobile}
                  onChange={(e) => setInviteMobile(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="form-input"
                  style={{ width: '100%', padding: '0.6rem 1rem' }}
                  required
                />
              </div>
              <button type="submit" disabled={generating} className="btn btn-primary" style={{ height: '46px', background: 'var(--accent-green)', color: '#000', padding: '0 2rem', fontWeight: 'bold' }}>
                {generating ? 'Generating...' : 'Generate Invite Link'}
              </button>
            </form>

            {inviteError && <div style={{ background: 'rgba(255,0,0,0.1)', border: '1px solid #ff4444', color: '#ff4444', padding: '0.8rem 1rem', borderRadius: '4px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>{inviteError}</div>}
            {inviteSuccess && <div style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid var(--accent-green)', color: 'var(--accent-green)', padding: '0.8rem 1rem', borderRadius: '4px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>{inviteSuccess}</div>}

            <h3 style={{ color: '#fff', margin: '0 0 1rem 0', fontSize: '1.1rem', letterSpacing: '1px', textTransform: 'uppercase' }}>Active Invites</h3>
            <div style={{ overflowX: 'auto' }}>
              {invitations.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic', padding: '1rem 0' }}>No invite links generated for this tournament yet.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--glass-border)' }}>
                      <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Mobile Number</th>
                      <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Status</th>
                      <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Created At</th>
                      <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map(inv => (
                      <tr key={inv.id} style={{ borderBottom: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.1)' }}>
                        <td style={{ padding: '0.8rem 1rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{inv.mobile}</td>
                        <td style={{ padding: '0.8rem 1rem' }}>
                          <span style={{ 
                            padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase',
                            background: inv.status === 'pending' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(57, 255, 20, 0.2)',
                            color: inv.status === 'pending' ? '#38bdf8' : 'var(--accent-green)'
                          }}>
                            {inv.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.8rem 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {new Date(inv.created_at).toLocaleString()}
                        </td>
                        <td style={{ padding: '0.8rem 1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                          <button onClick={() => handleCopyLink(inv.id)} className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', border: '1px solid var(--accent-gold)', color: 'var(--accent-gold)' }}>
                            Copy Link
                          </button>
                          <button onClick={() => handleRevokeInvite(inv.id)} className="btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        <button onClick={handleLogout} className="btn btn-outline" style={{ padding: '1rem 3rem', fontSize: '1.1rem', borderColor: '#ef4444', color: '#ef4444', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Secure Logout
        </button>
        
        <style>{`
          .render-card {
            transition: transform 0.3s ease, box-shadow 0.3s ease;
          }
          .render-card:hover {
            transform: translateY(-8px);
            box-shadow: 0 10px 30px rgba(57, 255, 20, 0.15);
            border-color: rgba(57, 255, 20, 0.4);
          }
        `}</style>
      </main>
    </div>
  );
};

export default AdminPage;
