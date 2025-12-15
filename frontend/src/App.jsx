import { useState } from 'react';
import { ethers } from 'ethers';
import abiFile from './TicketingSystem.json';
import './App.css';

// contract config
const CONTRACT_ADDRESS = "0x62c59d4De614368Bf3793D1fD3b2180Fb96C2De3"; 
const EXPLORER_URL = "https://sepolia.etherscan.io/tx/";

function App() {
  const [provider, setProvider] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState("");
  
  // Feedback System
  const [feedback, setFeedback] = useState({ message: "Ready", type: "neutral", link: null });
  const [activeTab, setActiveTab] = useState("profile"); 

  // --- FORM STATES ---
  const [artistName, setArtistName] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueCapacity, setVenueCapacity] = useState(100);
  const [venueCommission, setVenueCommission] = useState(20);

  const [cArtistId, setCArtistId] = useState(1);
  const [cVenueId, setCVenueId] = useState(1);
  const [cDate, setCDate] = useState("");
  const [cPrice, setCPrice] = useState("0.1");

  const [targetConcertId, setTargetConcertId] = useState(1);
  const [promoCode, setPromoCode] = useState(""); // Nouveau champ pour le code

  // --- UTILS ---
  const toBytes32 = (text) => ethers.encodeBytes32String(text);
  
  const updateStatus = (msg, type = "neutral", txHash = null) => {
    setFeedback({ message: msg, type: type, link: txHash ? EXPLORER_URL + txHash : null });
  };

  // --- BLOCKCHAIN ACTIONS ---

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const _provider = new ethers.BrowserProvider(window.ethereum);
        const _signer = await _provider.getSigner();
        const _contract = new ethers.Contract(CONTRACT_ADDRESS, abiFile.abi, _signer);
        
        setProvider(_provider);
        setContract(_contract);
        setAccount(await _signer.getAddress());
        updateStatus("Wallet Connected", "success");
      } catch (err) {
        console.error(err);
        updateStatus("Connection rejected", "error");
      }
    } else {
      alert("Metamask required");
    }
  };

  const createArtist = async () => {
    try {
      updateStatus("Waiting for signature...");
      const tx = await contract.createArtist(toBytes32(artistName), 1);
      updateStatus("Transaction sent...", "neutral", tx.hash);
      await tx.wait();
      
      const nextId = await contract.nextArtistId();
      updateStatus(`Artist Profile Created (ID: ${Number(nextId) - 1})`, "success", tx.hash);
    } catch (err) { updateStatus(err.reason || "Error creating artist", "error"); }
  };

  const createVenue = async () => {
    try {
      updateStatus("Waiting for signature...");
      const tx = await contract.createVenue(toBytes32(venueName), venueCapacity, venueCommission);
      updateStatus("Transaction sent...", "neutral", tx.hash);
      await tx.wait();

      const nextId = await contract.nextVenueId();
      updateStatus(`Venue Profile Created (ID: ${Number(nextId) - 1})`, "success", tx.hash);
    } catch (err) { updateStatus(err.reason || "Error creating venue", "error"); }
  };

  const createConcert = async () => {
    try {
      if (!cDate) return updateStatus("Invalid Date", "error");
      const timestamp = Math.floor(new Date(cDate).getTime() / 1000);
      const priceInWei = ethers.parseEther(cPrice);
      
      updateStatus("Waiting for signature...");
      const tx = await contract.createConcert(cArtistId, cVenueId, timestamp, priceInWei);
      updateStatus("Transaction sent...", "neutral", tx.hash);
      await tx.wait();

      const nextId = await contract.nextConcertId();
      updateStatus(`Event Created (ID: ${Number(nextId) - 1})`, "success", tx.hash);
    } catch (err) { updateStatus(err.reason || "Error creating event", "error"); }
  };

  const validateAs = async (role) => {
    try {
      updateStatus(`Validating as ${role}...`);
      let tx;
      if (role === "Artist") {
          tx = await contract.validateConcertArtist(targetConcertId);
      } else {
          tx = await contract.validateConcertVenue(targetConcertId);
      }
      updateStatus("Transaction sent...", "neutral", tx.hash);
      await tx.wait();
      updateStatus(`Validated by ${role}`, "success", tx.hash);
    } catch (err) { 
      updateStatus("Error: Not authorized (Check wallet)", "error"); 
    }
  };

  const buyTicket = async () => {
    try {
      updateStatus("Checking event status...");
      const concert = await contract.concerts(targetConcertId);
      
      if (!concert.validatedByArtist) throw new Error("Waiting for Artist validation");
      if (!concert.validatedByVenue) throw new Error("Waiting for Venue validation");
      
      const tx = await contract.buyTicket(targetConcertId, { value: concert.ticketPrice });
      updateStatus("Purchasing ticket...", "neutral", tx.hash);
      await tx.wait();
      updateStatus(`Ticket Successfully Purchased!`, "success", tx.hash);
    } catch (err) { updateStatus(err.message || "Purchase failed", "error"); }
  };

  // --- NOUVELLES FONCTIONS PROMO ---

  const createPromoCode = async () => {
    try {
      if(!promoCode) return updateStatus("Please enter a code", "error");
      
      updateStatus("Hashing code & registering...");
      
      // On hache le code secret côté Frontend avant de l'envoyer
      const secretHash = ethers.keccak256(ethers.toUtf8Bytes(promoCode));
      
      const tx = await contract.createRedeemableTicket(targetConcertId, secretHash);
      updateStatus("Registering Promo Code...", "neutral", tx.hash);
      await tx.wait();
      updateStatus(`Promo Code "${promoCode}" linked to Event #${targetConcertId}`, "success", tx.hash);
    } catch (err) { updateStatus(err.reason || "Error creating promo", "error"); }
  };

  const redeemPromoCode = async () => {
    try {
      if(!promoCode) return updateStatus("Please enter a code", "error");
      updateStatus("Redeeming ticket...");
      
      const tx = await contract.redeemTicket(promoCode);
      updateStatus("Transaction sent...", "neutral", tx.hash);
      await tx.wait();
      updateStatus(`Ticket Redeemed successfully!`, "success", tx.hash);
    } catch (err) { updateStatus("Invalid or used code", "error"); }
  };

  // --- RENDER ---

  if (!account) {
    return (
      <div className="landing">
        <h1>Ticketing Protocol</h1>
        <p style={{color: '#a1a1aa', marginBottom: '40px'}}>Decentralized Event Management on Ethereum</p>
        <button className="btn-primary" style={{maxWidth: '200px'}} onClick={connectWallet}>
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="container">
      
      {/* HEADER */}
      <header>
        <div>
          <h2>Ticketing Dashboard</h2>
          <span className="subtitle">Admin Panel</span>
        </div>
        <div className="badge">{account.slice(0,6)}...{account.slice(-4)}</div>
      </header>

      {/* NAVIGATION TABS */}
      <div className="tabs">
        <button 
          className={`tab-btn ${activeTab === "profile" ? "active" : ""}`} 
          onClick={() => setActiveTab("profile")}
        >
          Profiles
        </button>
        <button 
          className={`tab-btn ${activeTab === "concert" ? "active" : ""}`} 
          onClick={() => setActiveTab("concert")}
        >
          Planning
        </button>
        <button 
          className={`tab-btn ${activeTab === "actions" ? "active" : ""}`} 
          onClick={() => setActiveTab("actions")}
        >
          Operations
        </button>
      </div>

      <main>
        {/* TAB 1: PROFILES */}
        {activeTab === "profile" && (
          <div className="dashboard-grid">
            <div className="card">
              <h3>Create Artist</h3>
              <div>
                <label>Artist Name</label>
                <input placeholder="e.g. The Weeknd" onChange={e => setArtistName(e.target.value)} />
              </div>
              <div className="spacer-top"></div>
              <button className="btn-primary" onClick={createArtist}>Create Artist Profile</button>
            </div>

            <div className="card">
              <h3>Create Venue</h3>
              <div>
                <label>Venue Name</label>
                <input placeholder="e.g. Madison Square Garden" onChange={e => setVenueName(e.target.value)} />
                <div className="row">
                  <div><label>Capacity</label><input type="number" placeholder="5000" onChange={e => setVenueCapacity(e.target.value)} /></div>
                  <div><label>Commission (%)</label><input type="number" placeholder="20" onChange={e => setVenueCommission(e.target.value)} /></div>
                </div>
              </div>
              <div className="spacer-top"></div>
              <button className="btn-secondary" onClick={createVenue}>Create Venue Profile</button>
            </div>
          </div>
        )}

        {/* TAB 2: PLANNING */}
        {activeTab === "concert" && (
          <div className="card" style={{maxWidth: '800px', margin: '0 auto'}}>
            <h3>Plan New Event</h3>
            <div className="row">
              <div><label>Artist ID</label><input type="number" value={cArtistId} onChange={e => setCArtistId(e.target.value)} /></div>
              <div><label>Venue ID</label><input type="number" value={cVenueId} onChange={e => setCVenueId(e.target.value)} /></div>
            </div>
            <div className="row">
                <div><label>Event Date</label><input type="datetime-local" onChange={e => setCDate(e.target.value)} /></div>
                <div><label>Ticket Price (ETH)</label><input type="number" step="0.01" value={cPrice} onChange={e => setCPrice(e.target.value)} /></div>
            </div>
            <div className="spacer-top"></div>
            <button className="btn-primary" onClick={createConcert}>Publish Event to Blockchain</button>
          </div>
        )}

        {/* TAB 3: OPERATIONS (Mise à jour avec Promo Codes) */}
        {activeTab === "actions" && (
          <div className="dashboard-grid">
            
            {/* Organizer Card */}
            <div className="card">
              <h3>Organizer Zone</h3>
              <div>
                <label>Target Event ID</label>
                <input type="number" value={targetConcertId} onChange={e => setTargetConcertId(e.target.value)} />
                
                <label>Validation Actions</label>
                <div className="row">
                  <button className="btn-secondary" style={{marginTop:0}} onClick={() => validateAs("Artist")}>Validate (Artist)</button>
                  <button className="btn-secondary" style={{marginTop:0}} onClick={() => validateAs("Venue")}>Validate (Venue)</button>
                </div>

                {/* SECTION PROMO CODE */}
                <div style={{marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #333'}}>
                  <label>Create Promo Code</label>
                  <input placeholder="e.g. VIP2025" onChange={e => setPromoCode(e.target.value)} />
                  <button className="btn-primary" style={{marginTop: '10px'}} onClick={createPromoCode}>Register Code</button>
                </div>
              </div>
            </div>

            {/* Public Card */}
            <div className="card" style={{border: '1px solid #333'}}>
              <h3>Public Zone</h3>
              <div>
                <label>Target Event ID</label>
                <input type="number" value={targetConcertId} onChange={e => setTargetConcertId(e.target.value)} />
                
                <div className="spacer-top"></div>
                <button className="btn-primary" onClick={buyTicket}>Buy Ticket (ETH)</button>

                {/* SECTION REDEEM */}
                <div style={{marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #333'}}>
                  <label>Redeem Promo Code</label>
                  <input placeholder="Enter Secret Code" onChange={e => setPromoCode(e.target.value)} />
                  <button className="btn-secondary" style={{marginTop: '10px'}} onClick={redeemPromoCode}>Redeem Free Ticket</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* STATUS BAR */}
      <div className="status-bar">
        <div className={`dot ${feedback.type === 'success' ? 'success' : feedback.type === 'error' ? 'error' : ''}`}></div>
        <span>{feedback.message}</span>
        {feedback.link && <a href={feedback.link} target="_blank" rel="noopener noreferrer" className="status-link">View Tx ↗</a>}
      </div>

    </div>
  );
}

export default App;