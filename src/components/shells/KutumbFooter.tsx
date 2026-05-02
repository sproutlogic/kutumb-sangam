import React from 'react';
import { useNavigate } from 'react-router-dom';

const KutumbFooter: React.FC = () => {
  const navigate = useNavigate();
  return (
    <footer className="ds-footer">
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
        <div className="ds-footer-grid">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <img src="/prakriti.svg" alt="Prakriti" style={{ width: 36, height: 36, objectFit: 'contain' }} />
              <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 20, fontWeight: 600, color: 'var(--ds-gold-light)' }}>Prakriti</div>
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.6, maxWidth: 340 }}>
              India's first family-tree intelligence platform. For every parivar, every gotra, every village.
            </p>
            <p className="ds-sanskrit" style={{ marginTop: 18, color: 'var(--ds-gold-light)', fontSize: 18 }}>वसुधैव कुटुम्बकम्</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4, fontStyle: 'italic' }}>The world is one family.</p>
          </div>
          <div>
            <h4>Platform</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <li><button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>Dashboard</button></li>
              <li><button onClick={() => navigate('/tree')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>Family tree</button></li>
              <li><button onClick={() => navigate('/upgrade')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>Sachet pricing</button></li>
              <li><button onClick={() => navigate('/verification')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>Verification</button></li>
              <li><button onClick={() => navigate('/legacy-box')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>Smriti</button></li>
            </ul>
          </div>
          <div>
            <h4>Community</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <li><button onClick={() => navigate('/margdarshak-kyc')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>Become a Margdarshak</button></li>
              <li><button onClick={() => navigate('/kutumb-pro')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>Kutumb Pro</button></li>
              <li><button onClick={() => navigate('/harit-circle')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>Harit Circle</button></li>
              <li><button onClick={() => navigate('/eco-panchang')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>Eco Panchang</button></li>
              <li><button onClick={() => navigate('/dashboard?join-team=1')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>Join our team</button></li>
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <li><a href="https://ecotech.co.in" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>Aarush Eco Tech</a></li>
              <li><button onClick={() => navigate('/support')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>Contact support</button></li>
              <li><button onClick={() => navigate('/settings')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>Settings</button></li>
            </ul>
          </div>
        </div>
        <div className="ds-footer-bottom">
          <span>© 2026 Aarush Eco Tech Pvt. Ltd. — All rights reserved.</span>
          <span>DPIIT-recognized · Incubated at SIIC, IIT Kanpur</span>
        </div>
      </div>
    </footer>
  );
};

export default KutumbFooter;
