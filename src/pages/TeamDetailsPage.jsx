import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import PageHeader from '../components/PageHeader';
import { Loader } from '../components/Loader';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { getOptimizedImageUrl } from '../services/cloudinary';
import { generateAllTeamsPDF } from '../services/pdfGenerator';
import { Download } from 'lucide-react';

const getTeamInitials = (name) => {
  if (!name) return '';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return words.map(w => w.charAt(0)).join('').toUpperCase();
};

const getPlayerInitials = (p) => {
  if (!p) return '';
  return ((p.first_name?.charAt(0) || '') + (p.last_name?.charAt(0) || '')).toUpperCase();
};

const TeamDetailsPage = () => {
    const isAuthenticated = localStorage.getItem('cap_admin_auth') === 'true';
    const [searchParams] = useSearchParams();
    const auctionCode = searchParams.get('code') || localStorage.getItem('cap_admin_selected_auction_code');

    const [loading, setLoading] = useState(true);
    const [activeAuction, setActiveAuction] = useState(null);
    const [teams, setTeams] = useState([]);
    const [squads, setSquads] = useState({});
    const [selectedTeamId, setSelectedTeamId] = useState(null);

    useEffect(() => {
        if (!isAuthenticated) {
            setLoading(false);
            return;
        }
        fetchData();
        
        const subscription = supabase
            .channel('team_updates_vertical')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_players' }, payload => {
                const { new: updatedPlayer, old: oldPlayer } = payload;
                if (!updatedPlayer || !oldPlayer) {
                    fetchData(); // Always refetch for inserts/deletes
                    return;
                }
                const statusChanged = updatedPlayer.auction_status !== oldPlayer.auction_status;
                const teamChanged = updatedPlayer.team_id !== oldPlayer.team_id;
                if (statusChanged || teamChanged) {
                    fetchData();
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [isAuthenticated, auctionCode]);

    const fetchData = async () => {
        try {
            setLoading(true);
            if (!auctionCode) {
                setLoading(false);
                return;
            }

            const { data: auctionData, error: auctionError } = await supabase
                .from('auctions')
                .select('*')
                .eq('auction_code', auctionCode)
                .maybeSingle();

            if (auctionError) throw auctionError;
            setActiveAuction(auctionData);

            if (auctionData) {
                const { data: tData, error: tError } = await supabase
                    .from('auction_teams')
                    .select('*')
                    .eq('auction_id', auctionData.id)
                    .order('created_at', { ascending: true });

                if (tError) throw tError;
                setTeams(tData || []);
                if (tData && tData.length > 0 && !selectedTeamId) {
                    setSelectedTeamId(tData[0].id);
                }

                const { data: apData, error: apError } = await supabase
                    .from('auction_players')
                    .select('*, players(*)')
                    .eq('auction_id', auctionData.id)
                    .eq('approval_status', 'approved');

                if (apError) throw apError;

                const grouped = {};
                (tData || []).forEach(team => {
                    grouped[team.id] = (apData || []).filter(p => p.team_id === team.id);
                });
                setSquads(grouped);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (!isAuthenticated) return <Navigate to="/admin" replace />;
    if (!auctionCode || (!loading && !activeAuction)) return <Navigate to="/admin" replace />;
    if (loading) return <Loader message="ORGANIZING TEAM ROSTERS..." />;

    const selectedTeam = teams.find(t => t.id === selectedTeamId);
    const squad = selectedTeamId ? (squads[selectedTeamId] || []) : [];
    const owners = squad.filter(p => p.is_owner);
    const icons = squad.filter(p => p.is_icon);
    const auctioned = squad.filter(p => !p.is_icon && !p.is_owner);
    const spent = squad.reduce((acc, p) => acc + (p.sold_price || 0), 0);
    const maxBudget = activeAuction?.max_budget || 0;
    const remaining = maxBudget - spent;
    const percentSpent = (spent / maxBudget) * 100;

    return (
        <div className="flex-col min-h-screen">
            <div className="spotlight"></div>
            <PageHeader title="Team Roster & Purse" showLogos={false} />

            <main className="container" style={{ padding: '2rem 1rem', zIndex: 1, position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                         <Link to="/admin" className="btn btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>← Dashboard</Link>
                         <h2 style={{ color: 'var(--text-main)', margin: 0, fontSize: '1.2rem' }}>{activeAuction?.auction_name || 'Auction Details'}</h2>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {activeAuction && teams.length > 0 && (
                            <button 
                                onClick={() => generateAllTeamsPDF(activeAuction, teams, squads)}
                                className="btn btn-outline" 
                                style={{ 
                                    padding: '0.5rem 1.2rem', 
                                    border: '1px solid var(--accent-green)', 
                                    color: 'var(--accent-green)', 
                                    fontSize: '0.9rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    cursor: 'pointer',
                                    background: 'transparent'
                                }}
                            >
                                <Download size={16} /> Download Teams PDF
                            </button>
                        )}
                        <Link to="/live-auction" className="btn btn-primary" style={{ padding: '0.5rem 1.2rem', background: 'var(--accent-gold)', fontSize: '0.9rem' }}>Live Bidding</Link>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '2rem', height: 'calc(100vh - 250px)', minHeight: '600px' }}>
                    
                    {/* Vertical Sidebar */}
                    <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto', borderRight: '1px solid var(--border-color)' }}>
                        <h3 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1rem', paddingLeft: '0.5rem' }}>SELECT TEAM</h3>
                        {teams.map(team => (
                            <button
                                key={team.id}
                                onClick={() => setSelectedTeamId(team.id)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    padding: '0.8rem',
                                    borderRadius: '8px',
                                    border: '1px solid transparent',
                                    background: selectedTeamId === team.id ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.03)',
                                    borderColor: selectedTeamId === team.id ? 'var(--accent-gold)' : 'transparent',
                                    color: selectedTeamId === team.id ? 'var(--accent-gold)' : 'var(--text-main)',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {team.logo_url ? (
                                    <img src={team.logo_url} alt="L" style={{ width: 30, height: 30, borderRadius: '50%', background: '#fff', objectFit: 'contain' }} />
                                ) : (
                                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-gold)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                        {getTeamInitials(team.team_name)}
                                    </div>
                                )}
                                <span style={{ fontSize: '0.9rem', fontWeight: selectedTeamId === team.id ? 'bold' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.team_name}</span>
                            </button>
                        ))}
                    </div>

                    {/* Right Side Content */}
                    <div className="glass-panel" style={{ padding: '2.5rem', overflowY: 'auto' }}>
                        {selectedTeam ? (
                            <div>
                                {/* Header with Stats */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '3rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '2.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                                        {selectedTeam.logo_url ? (
                                            <img src={selectedTeam.logo_url} alt="Team" style={{ width: 120, height: 120, objectFit: 'contain', borderRadius: '15px', background: '#fff', padding: '10px', border: '3px solid var(--accent-gold)', boxShadow: '0 0 20px rgba(255,215,0,0.2)' }} />
                                        ) : (
                                            <div style={{ width: 120, height: 120, borderRadius: '15px', background: 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(57,255,20,0.1))', border: '3px solid var(--accent-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 900, color: 'var(--accent-gold)', boxShadow: '0 0 20px rgba(255,215,0,0.2)' }}>
                                                {getTeamInitials(selectedTeam.team_name)}
                                            </div>
                                        )}
                                        <div>
                                            <h2 style={{ fontSize: '2.5rem', color: 'var(--accent-gold)', margin: '0 0 0.5rem 0' }}>{selectedTeam.team_name}</h2>
                                            <div style={{ display: 'flex', gap: '2rem' }}>
                                                <div>
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block' }}>SQUAD SIZE</span>
                                                    <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{squad.length} Players</span>
                                                </div>
                                                <div>
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block' }}>PURSE SPENT</span>
                                                    <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>₹{spent.toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Purse Progress Box */}
                                    <div style={{ width: '300px', background: 'rgba(0,0,0,0.2)', padding: '1.2rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Purse Spent: {percentSpent.toFixed(0)}%</span>
                                            <span style={{ color: '#fff', fontWeight: 'bold' }}>Remaining: {((100 - percentSpent)).toFixed(0)}%</span>
                                        </div>
                                        <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                                            <div style={{ width: `${percentSpent}%`, height: '100%', background: percentSpent > 85 ? '#ef4444' : percentSpent > 60 ? '#f59e0b' : 'var(--accent-green)', borderRadius: '10px' }}></div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.8rem', fontSize: '0.8rem' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Spent: ₹{spent.toLocaleString()}</span>
                                            <span style={{ color: 'var(--accent-green)', fontWeight: 'bold' }}>Rem: ₹{remaining.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Detailed Squad Lists */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem' }}>
                                    
                                    {/* Owner & Icon Players Listing */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                        {/* Owner Players */}
                                        <div>
                                            <h4 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--accent-green)', marginBottom: '1.5rem', borderBottom: '1px solid rgba(57,255,20,0.2)', paddingBottom: '0.5rem' }}>
                                                OWNER PLAYERS <span>({owners.length})</span>
                                            </h4>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                {owners.length === 0 ? <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No owner players assigned.</p> : owners.map(p => (
                                                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(57,255,20,0.05)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(57,255,20,0.1)' }}>
                                                        {p.players.photo_url ? (
                                                            <img src={getOptimizedImageUrl(p.players.photo_url, 150)} alt="Player" style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent-green)' }} />
                                                        ) : (
                                                            <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(57,255,20,0.2), rgba(0,0,0,0.4))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 'bold', color: 'var(--accent-green)', border: '2px solid var(--accent-green)' }}>
                                                                {getPlayerInitials(p.players)}
                                                            </div>
                                                        )}
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{p.players.first_name} {p.players.last_name}</div>
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--accent-green)' }}>{p.players.player_role.toUpperCase()}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Icon Players */}
                                        <div>
                                            <h4 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--accent-gold)', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,215,0,0.2)', paddingBottom: '0.5rem' }}>
                                                ICON PLAYERS <span>({icons.length})</span>
                                            </h4>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                {icons.length === 0 ? <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No icon players assigned.</p> : icons.map(p => (
                                                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(255,215,0,0.05)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,215,0,0.1)' }}>
                                                        {p.players.photo_url ? (
                                                            <img src={getOptimizedImageUrl(p.players.photo_url, 150)} alt="Player" style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent-gold)' }} />
                                                        ) : (
                                                            <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(0,0,0,0.4))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 'bold', color: 'var(--accent-gold)', border: '2px solid var(--accent-gold)' }}>
                                                                {getPlayerInitials(p.players)}
                                                            </div>
                                                        )}
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{p.players.first_name} {p.players.last_name}</div>
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--accent-gold)' }}>{p.players.player_role.toUpperCase()}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Auctioned Players Listing */}
                                    <div>
                                        <h4 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-main)', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                                            AUCTIONED PLAYERS <span>({auctioned.length})</span>
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                            {auctioned.length === 0 ? <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No auction players bought yet.</p> : auctioned.map(p => (
                                                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.8rem 1.2rem', borderRadius: '10px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                        {p.players.photo_url ? (
                                                            <img src={getOptimizedImageUrl(p.players.photo_url, 150)} alt="Player" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                                                        ) : (
                                                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 'bold', color: '#fff' }}>
                                                                {getPlayerInitials(p.players)}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{p.players.first_name} {p.players.last_name}</div>
                                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.players.player_role}</div>
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ color: 'var(--accent-gold)', fontWeight: 'bold' }}>₹{p.sold_price?.toLocaleString()}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                                Select a team to view its squad roster and purse budget details.
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default TeamDetailsPage;
