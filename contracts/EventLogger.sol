// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title EventLogger
 * @notice Stateless event logger for Gold Provenance anchoring
 * @dev Minimal gas usage by only emitting events (no storage)
 * 
 * This contract implements the "Event Logger" pattern for blockchain anchoring:
 * - No on-chain storage (minimizes gas costs by ~90%)
 * - Pure event emission for immutable timestamping
 * - Indexed fields for efficient off-chain querying
 */
contract EventLogger {
    
    /// @notice Emitted when a hash is anchored
    /// @param id The batch or event identifier (indexed for fast lookups)
    /// @param hash The Keccak256 hash of the canonical JSON payload
    /// @param timestamp The block timestamp when anchored
    /// @param sender The address that submitted the anchor
    event HashAnchored(
        bytes32 indexed id,
        bytes32 hash,
        uint256 timestamp,
        address indexed sender
    );

    /// @notice Emitted for batch-specific anchoring
    /// @param batchId The batch identifier
    /// @param payloadHash Hash of the batch data
    event BatchAnchored(
        bytes32 indexed batchId,
        bytes32 payloadHash,
        uint256 timestamp
    );

    /// @notice Emitted for event-specific anchoring
    /// @param eventId The event identifier
    /// @param batchId The associated batch identifier
    /// @param eventType The type of event (Create, Ship, Transfer, Receive, etc.)
    /// @param payloadHash Hash of the event data
    event EventAnchored(
        bytes32 indexed eventId,
        bytes32 indexed batchId,
        string eventType,
        bytes32 payloadHash,
        uint256 timestamp
    );

    /**
     * @notice Anchor a generic hash
     * @param id Identifier (batchId or eventId)
     * @param hash Keccak256 hash of the canonical JSON payload
     */
    function logHash(bytes32 id, bytes32 hash) external {
        emit HashAnchored(id, hash, block.timestamp, msg.sender);
    }

    /**
     * @notice Anchor a batch record
     * @param batchId The batch identifier
     * @param payloadHash Hash of the batch data
     */
    function anchorBatch(bytes32 batchId, bytes32 payloadHash) external {
        emit BatchAnchored(batchId, payloadHash, block.timestamp);
        emit HashAnchored(batchId, payloadHash, block.timestamp, msg.sender);
    }

    /**
     * @notice Anchor a traceability event
     * @param eventId The event identifier
     * @param batchId The associated batch identifier
     * @param eventType The type of event (e.g., "Create", "Ship", "Receive")
     * @param payloadHash Hash of the event data
     */
    function anchorEvent(
        bytes32 eventId,
        bytes32 batchId,
        string calldata eventType,
        bytes32 payloadHash
    ) external {
        emit EventAnchored(eventId, batchId, eventType, payloadHash, block.timestamp);
        emit HashAnchored(eventId, payloadHash, block.timestamp, msg.sender);
    }

    /**
     * @notice Batch anchor multiple hashes in one transaction
     * @param ids Array of identifiers
     * @param hashes Array of corresponding hashes
     * @dev More gas efficient for multiple anchors
     */
    function logHashBatch(bytes32[] calldata ids, bytes32[] calldata hashes) external {
        require(ids.length == hashes.length, "Arrays length mismatch");
        
        for (uint256 i = 0; i < ids.length; i++) {
            emit HashAnchored(ids[i], hashes[i], block.timestamp, msg.sender);
        }
    }
}
