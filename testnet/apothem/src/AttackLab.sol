// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Valueless training contracts for XDC Apothem (chain 51) only.
/// They intentionally expose suspicious transaction shapes so Safe Inspector can
/// test detection. Never deploy or fund these contracts on a production chain.
interface ITrainingToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract TrainingToken {
    string public constant name = "Safe Inspector Training Token";
    string public constant symbol = "SITT";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    constructor() {
        _mint(msg.sender, 1_000_000 ether);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 available = allowance[from][msg.sender];
        require(available >= amount, "ALLOWANCE");
        if (available != type(uint256).max) {
            allowance[from][msg.sender] = available - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function mintForTraining(address to, uint256 amount) external {
        require(block.chainid == 51, "APOTHEM_ONLY");
        _mint(to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "ZERO_RECIPIENT");
        require(balanceOf[from] >= amount, "BALANCE");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

contract UnknownSpender {
    event Pulled(address indexed token, address indexed from, address indexed recipient, uint256 amount);

    function pull(address token, address from, address recipient, uint256 amount) external {
        require(block.chainid == 51, "APOTHEM_ONLY");
        require(ITrainingToken(token).transferFrom(from, recipient, amount), "TRANSFER_FAILED");
        emit Pulled(token, from, recipient, amount);
    }
}

contract InjectedRecipientRouter {
    event Routed(address indexed token, address indexed sender, address indexed recipient, uint256 amount);

    function route(address token, address recipient, uint256 amount) external {
        require(block.chainid == 51, "APOTHEM_ONLY");
        require(ITrainingToken(token).transferFrom(msg.sender, recipient, amount), "TRANSFER_FAILED");
        emit Routed(token, msg.sender, recipient, amount);
    }
}

contract DelegateMutation {
    event MutationAttempt(address indexed caller);

    function mutate() external {
        require(block.chainid == 51, "APOTHEM_ONLY");
        emit MutationAttempt(msg.sender);
        assembly {
            sstore(0, caller())
        }
    }
}

contract HiddenMulticall {
    event NativeSent(address indexed recipient, uint256 amount);

    function multicall(bytes[] calldata calls) external payable returns (bytes[] memory results) {
        require(block.chainid == 51, "APOTHEM_ONLY");
        results = new bytes[](calls.length);
        for (uint256 i = 0; i < calls.length; i++) {
            (bool ok, bytes memory result) = address(this).delegatecall(calls[i]);
            require(ok, "SUBCALL_FAILED");
            results[i] = result;
        }
    }

    function sendNative(address payable recipient, uint256 amount) external {
        require(block.chainid == 51, "APOTHEM_ONLY");
        require(address(this).balance >= amount, "BALANCE");
        (bool ok,) = recipient.call{value: amount}("");
        require(ok, "NATIVE_SEND_FAILED");
        emit NativeSent(recipient, amount);
    }
}

contract ProxyUpgradeTrap {
    bytes32 private constant IMPLEMENTATION_SLOT =
        bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1);

    event Upgraded(address indexed implementation);

    function implementation() external view returns (address value) {
        bytes32 slot = IMPLEMENTATION_SLOT;
        assembly {
            value := sload(slot)
        }
    }

    function upgradeToAndCall(address newImplementation, bytes calldata data) external payable {
        require(block.chainid == 51, "APOTHEM_ONLY");
        require(newImplementation.code.length > 0, "NO_CODE");
        bytes32 slot = IMPLEMENTATION_SLOT;
        assembly {
            sstore(slot, newImplementation)
        }
        emit Upgraded(newImplementation);
        if (data.length > 0) {
            (bool ok, bytes memory reason) = newImplementation.delegatecall(data);
            if (!ok) {
                assembly {
                    revert(add(reason, 32), mload(reason))
                }
            }
        }
    }
}
