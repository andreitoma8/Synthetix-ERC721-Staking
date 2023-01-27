// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

/**
 * @title Mock NFT Collection
 * @dev This is a mock NFT collection for testing purposes only
 */
contract NFTCollection is ERC721, ERC721Enumerable, Ownable {
  using Counters for Counters.Counter;

  Counters.Counter private _tokenIdCounter;

  /**
   * @dev Initializes the contract by setting a `name` and a `symbol` to the token collection.
   */
  constructor() ERC721("NFTCollection", "NFTC") {}

  /**
   * @notice Mint NFTs
   * @param _to the address to mint the NFTs to
   * @param _amount the amount of NFTs to mint
   */
  function mint(address _to, uint256 _amount) public {
    for (uint256 i; i < _amount; i++) {
      _tokenIdCounter.increment();
      uint256 tokenId = _tokenIdCounter.current();
      _safeMint(_to, tokenId);
    }
  }

  /**
   * @notice Get all the token IDs owned by an address
   * @param _owner the address to get the token IDs for
   * @return uint256[] memory the token IDs owned by the address
   */
  function tokensOfOwner(
    address _owner
  ) public view returns (uint256[] memory) {
    uint256 ownerTokenCount = balanceOf(_owner);
    uint256[] memory ownedTokenIds = new uint256[](ownerTokenCount);
    for (uint256 i; i < ownerTokenCount; ++i) {
      ownedTokenIds[i] = tokenOfOwnerByIndex(_owner, i);
    }
    return ownedTokenIds;
  }

  // The following functions are overrides required by Solidity.

  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 tokenId,
    uint256 batchSize
  ) internal override(ERC721, ERC721Enumerable) {
    super._beforeTokenTransfer(from, to, tokenId, batchSize);
  }

  function supportsInterface(
    bytes4 interfaceId
  ) public view override(ERC721, ERC721Enumerable) returns (bool) {
    return super.supportsInterface(interfaceId);
  }
}
