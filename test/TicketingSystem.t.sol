pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/TicketingSystem.sol";

contract TicketingSystemTest is Test {
    TicketingSystem public ticketing;

    // test accounts
    address artistUser;
    address venueUser;
    address fan1;
    address fan2;

    // initialize test environment
    function setUp() public {
        ticketing = new TicketingSystem();
        
        artistUser = makeAddr("artist");
        venueUser = makeAddr("venue");
        fan1 = makeAddr("fan1");
        fan2 = makeAddr("fan2");
        vm.deal(fan1, 100 ether);
        vm.deal(fan2, 100 ether);
    }

    // full workflow test from creation to cashout
    function testFullScenario() public {
        vm.prank(artistUser); 
        ticketing.createArtist("The Beatles", 1);
        
        vm.prank(venueUser);
        ticketing.createVenue("Zenith", 5000, 20);

        uint256 concertDate = block.timestamp + 2 days;
        ticketing.createConcert(1, 1, concertDate, 1 ether);

        vm.prank(artistUser);
        ticketing.validateConcert(1);
        
        vm.prank(venueUser);
        ticketing.validateConcert(1);

        vm.prank(fan1);
        ticketing.buyTicket{value: 1 ether}(1);

        ( , address owner, , ) = ticketing.tickets(1);
        assertEq(owner, fan1);

        vm.prank(fan1);
        vm.expectRevert("Too early");
        ticketing.useTicket(1);

        vm.warp(concertDate - 1 hours);
        
        vm.prank(fan1);
        ticketing.useTicket(1);
        ( , , bool isUsed, ) = ticketing.tickets(1);
        assertTrue(isUsed);

        vm.warp(concertDate + 1 days);
        
        uint256 balanceArtistBefore = artistUser.balance;
        uint256 balanceVenueBefore = venueUser.balance;

        vm.prank(artistUser);
        ticketing.cashOut(1);
        assertEq(venueUser.balance - balanceVenueBefore, 0.2 ether);
        assertEq(artistUser.balance - balanceArtistBefore, 0.8 ether);
    }

    // test secondary market with anti-scalping
    function testSafeTrade() public {
        artistUser = makeAddr("artist");
        venueUser = makeAddr("venue");
        fan1 = makeAddr("fan1");
        fan2 = makeAddr("fan2");
        vm.deal(fan1, 100 ether);
        vm.deal(fan2, 100 ether);

        ticketing = new TicketingSystem();

        vm.prank(artistUser); ticketing.createArtist("Artist", 1);
        vm.prank(venueUser); ticketing.createVenue("Venue", 100, 10);
        ticketing.createConcert(1, 1, block.timestamp + 1000, 1 ether);
        vm.prank(artistUser); ticketing.validateConcert(1);
        vm.prank(venueUser); ticketing.validateConcert(1);
        
        vm.prank(fan1);
        ticketing.buyTicket{value: 1 ether}(1);

        vm.prank(fan1);
        vm.expectRevert("Price too high (Scalping protection)");
        ticketing.offerTicketForSale(1, 1.5 ether);

        vm.prank(fan1);
        ticketing.offerTicketForSale(1, 0.9 ether);
        vm.prank(fan2);
        ticketing.buySecondHandTicket{value: 0.9 ether}(1);

        ( , address newOwner, , ) = ticketing.tickets(1);
        assertEq(newOwner, fan2);
    }
    
    // test promo code system
    function testRedeemTicket() public {
        artistUser = makeAddr("artist");
        venueUser = makeAddr("venue");
        address luckyFan = makeAddr("luckyFan");

        ticketing = new TicketingSystem();

        vm.prank(artistUser); ticketing.createArtist("Artist", 1);
        vm.prank(venueUser); ticketing.createVenue("Venue", 100, 10);
        ticketing.createConcert(1, 1, block.timestamp + 1000, 1 ether);
        vm.prank(artistUser); ticketing.validateConcert(1);
        vm.prank(venueUser); ticketing.validateConcert(1);

        bytes32 secretHash = keccak256(abi.encodePacked("VIP2024"));
        vm.prank(artistUser);
        ticketing.createRedeemableTicket(1, secretHash);

        vm.prank(luckyFan);
        ticketing.redeemTicket("VIP2024");

        ( , address owner, , uint256 price) = ticketing.tickets(1);
        assertEq(owner, luckyFan);
        assertEq(price, 0);
        address cheater = makeAddr("cheater");
        vm.prank(cheater);
        vm.expectRevert("Code already used");
        ticketing.redeemTicket("VIP2024");
    }
}