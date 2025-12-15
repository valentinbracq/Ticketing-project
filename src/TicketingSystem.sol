pragma solidity ^0.8.19;

contract TicketingSystem {

    // data structures
    struct Artist {
        bytes32 name;
        uint256 artistType;
        uint256 totalTicketsSold;
        address payable owner;
    }

    struct Venue {
        bytes32 name;
        uint256 capacity;
        uint256 commissionPercent;
        address payable owner;
    }

    struct Concert {
        uint256 id;
        uint256 artistId;
        uint256 venueId;
        uint256 concertDate;
        uint256 ticketPrice;
        bool validatedByArtist;
        bool validatedByVenue;
        uint256 totalSold;
        bool isCashedOut;
    }

    struct Ticket {
        uint256 concertId;
        address owner;
        bool isUsed;
        uint256 purchasePrice;
    }
    
    // storage mappings
    mapping(uint256 => Artist) public artists;
    mapping(uint256 => Venue) public venues;
    mapping(uint256 => Concert) public concerts;
    mapping(uint256 => Ticket) public tickets;

    // id counters
    uint256 public nextArtistId = 1;
    uint256 public nextVenueId = 1;
    uint256 public nextConcertId = 1;
    uint256 public nextTicketId = 1;

    // promo code system
    mapping(bytes32 => uint256) private redeemableTickets;
    mapping(bytes32 => bool) private redeemedCodes;

    // profile management
    function createArtist(bytes32 _name, uint256 _type) external {
        artists[nextArtistId] = Artist(_name, _type, 0, payable(msg.sender));
        nextArtistId++;
    }

    function modifyArtist(uint256 _id, bytes32 _newName, uint256 _newType) external {
        require(msg.sender == artists[_id].owner, "Not artist owner");
        artists[_id].name = _newName;
        artists[_id].artistType = _newType;
    }

    function createVenue(bytes32 _name, uint256 _capacity, uint256 _commission) external {
        require(_commission <= 100, "Commission too high");
        venues[nextVenueId] = Venue(_name, _capacity, _commission, payable(msg.sender));
        nextVenueId++;
    }

    function modifyVenue(uint256 _id, bytes32 _newName, uint256 _newCapacity, uint256 _newCom) external {
        require(msg.sender == venues[_id].owner, "Not venue owner");
        venues[_id].name = _newName;
        venues[_id].capacity = _newCapacity;
        venues[_id].commissionPercent = _newCom;
    }

    // concert management
    function createConcert(uint256 _artistId, uint256 _venueId, uint256 _date, uint256 _price) external {
        concerts[nextConcertId] = Concert(
            nextConcertId, _artistId, _venueId, _date, _price, false, false, 0, false
        );
        nextConcertId++;
    }

    function validateConcertArtist(uint256 _concertId) external {
        Concert storage c = concerts[_concertId];
        require(msg.sender == artists[c.artistId].owner, "Not artist owner");
        c.validatedByArtist = true;
    }

    function validateConcertVenue(uint256 _concertId) external {
        Concert storage c = concerts[_concertId];
        require(msg.sender == venues[c.venueId].owner, "Not venue owner");
        c.validatedByVenue = true;
    }

    // ticket emission and purchase
    function emitTicket(uint256 _concertId, address _receiver) external {
        Concert storage c = concerts[_concertId];
        require(msg.sender == artists[c.artistId].owner, "Only artist can emit");
        require(c.validatedByArtist && c.validatedByVenue, "Concert not validated");
        
        _mintTicket(_concertId, _receiver, 0);
    }
    function buyTicket(uint256 _concertId) external payable {
        Concert storage c = concerts[_concertId];
        require(c.validatedByArtist && c.validatedByVenue, "Concert not validated");
        require(msg.value == c.ticketPrice, "Incorrect price");
        require(c.totalSold < venues[c.venueId].capacity, "Sold out");

        _mintTicket(_concertId, msg.sender, msg.value);
    }

    // internal helper to mint tickets
    function _mintTicket(uint256 _concertId, address _owner, uint256 _price) internal {
        tickets[nextTicketId] = Ticket(_concertId, _owner, false, _price);
        
        concerts[_concertId].totalSold++;
        artists[concerts[_concertId].artistId].totalTicketsSold++;
        nextTicketId++;
    }

    // use ticket at concert
    function useTicket(uint256 _ticketId) external {
        Ticket storage t = tickets[_ticketId];
        require(msg.sender == t.owner, "Not owner");
        require(!t.isUsed, "Already used");
        
        Concert memory c = concerts[t.concertId];
        require(block.timestamp >= c.concertDate - 1 days, "Too early");
        require(block.timestamp < c.concertDate + 1 days, "Concert finished");

        t.isUsed = true;
    }

    // promo code redemption
    function createRedeemableTicket(uint256 _concertId, bytes32 _secretHash) external {
        redeemableTickets[_secretHash] = _concertId;
    }
    function redeemTicket(string memory _password) external {
        bytes32 hash = keccak256(abi.encodePacked(_password));
        uint256 concertId = redeemableTickets[hash];
        
        require(concertId != 0, "Invalid code");
        require(!redeemedCodes[hash], "Code already used");

        redeemedCodes[hash] = true;
        _mintTicket(concertId, msg.sender, 0);
    }

    // ticket transfer (deprecated)
    function transferTicket(uint256 _ticketId, address _to) external payable {
        Ticket storage t = tickets[_ticketId];
        require(msg.sender == _to, "Buyer initiates trade with payment");
        revert("Use safeTransfer instead"); 
    }

    function safeTransfer(uint256 _ticketId, address _newOwner) external payable {
        revert("Complexity: requires 2 steps (Offer/Buy)");
    }
    
    // secondary market system
    struct TicketOffer {
        bool isForSale;
        uint256 price;
    }
    mapping(uint256 => TicketOffer) public ticketOffers;

    function offerTicketForSale(uint256 _ticketId, uint256 _price) external {
        Ticket storage t = tickets[_ticketId];
        require(msg.sender == t.owner, "Not owner");
        require(_price <= t.purchasePrice, "Price too high (Scalping protection)");
        ticketOffers[_ticketId] = TicketOffer(true, _price);
    }

    function buySecondHandTicket(uint256 _ticketId) external payable {
        TicketOffer memory offer = ticketOffers[_ticketId];
        require(offer.isForSale, "Not for sale");
        require(msg.value == offer.price, "Wrong price");

        Ticket storage t = tickets[_ticketId];
        address payable seller = payable(t.owner);

        t.owner = msg.sender;
        t.purchasePrice = msg.value;
        ticketOffers[_ticketId].isForSale = false;
        seller.transfer(msg.value);
    }

    // revenue distribution
    function cashOut(uint256 _concertId) external {
        Concert storage c = concerts[_concertId];
        require(!c.isCashedOut, "Already cashed out");
        require(block.timestamp > c.concertDate, "Concert not happened yet");
        require(msg.sender == artists[c.artistId].owner, "Only artist can trigger cashout");

        c.isCashedOut = true;

        uint256 totalRevenue = c.ticketPrice * c.totalSold;
        uint256 venueShare = (totalRevenue * venues[c.venueId].commissionPercent) / 100;
        uint256 artistShare = totalRevenue - venueShare;

        venues[c.venueId].owner.transfer(venueShare);
        artists[c.artistId].owner.transfer(artistShare);
    }
}