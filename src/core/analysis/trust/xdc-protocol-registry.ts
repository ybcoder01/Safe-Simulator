import type { Address } from "../../domain";
import type {
  ContractRegistryEntry,
  ContractRegistryLifecycle,
  ContractRegistryProtocol,
  ContractRegistryRole,
  ContractRegistryTrustPolicy,
} from "./contract-registry";

interface ProtocolDeploymentGroup {
  readonly protocol: ContractRegistryProtocol;
  readonly reference: string;
  readonly logoKey: string;
  readonly deployments: readonly (readonly [
    address: string,
    label: string,
    role: ContractRegistryRole,
    trustPolicy: ContractRegistryTrustPolicy,
    lifecycle: ContractRegistryLifecycle,
  ])[];
}

const REVIEWED_AT = "2026-09-03";

const groups: readonly ProtocolDeploymentGroup[] = [
  {
    "protocol": "xswap",
    "reference": "https://docs.xspswap.finance/xswap-protocol/contracts/xswap-protocol-contracts",
    "logoKey": "xswap",
    "deployments": [
      [
        "0x347D14b13a68457186b2450bb2a6c2Fd7B38352f",
        "XSwap V2 Factory",
        "dex-factory",
        "protocol-whitelist",
        "active"
      ],
      [
        "0xf9c5E4f6E627201aB2d6FB6391239738Cf4bDcf9",
        "XSwap V2 Router",
        "dex-router",
        "protocol-whitelist",
        "active"
      ],
      [
        "0xe1bcb1c502a545ee85a1881b95cdd46d394d2b2e",
        "XSwap V3 Universal Router",
        "dex-router",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x3b9edecc4286ba33ea6e27119c2a4db99829839d",
        "XSwap V3 SwapRouter02",
        "dex-router",
        "protocol-whitelist",
        "active"
      ],
      [
        "0xecf4ea7907e779b8a7d0f90cb95fe06f43b610fb",
        "XSwap V3 Router",
        "dex-router",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x36726235dAdbdb4658D33E62a249dCA7c4B2bC68",
        "XSP Token",
        "token",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x17476dc3eda45aD916cEAdDeA325B240A7FB259D",
        "XSwap Treasury Token",
        "token",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x951857744785E80e2De051c32EE7b25f9c458C42",
        "Wrapped XDC",
        "token",
        "protocol-whitelist",
        "active"
      ]
    ]
  },
  {
    "protocol": "curve",
    "reference": "https://github.com/curvefi/curve-core/blob/fdcddede6c0564bb48eba8bbdfff72da8f650024/deployments/prod/xdc.yaml",
    "logoKey": "curve",
    "deployments": [
      [
        "0xBaF6cacFfFb6D57d548F0FAff486E9884a0D1747",
        "Curve Governance Vault",
        "vault",
        "identity-only",
        "internal"
      ],
      [
        "0x0B1795ccA8E4eC4df02346a082df54D437F8D9aF",
        "Curve Multicall3",
        "multicall",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x5aEa9aaDd0974e8914229a23699bB6b343c97B09",
        "Curve StableSwap Factory",
        "dex-factory",
        "protocol-whitelist",
        "active"
      ],
      [
        "0xA626B239e30dF83a228e5D87daB005819267d1BA",
        "Curve StableSwap Implementation",
        "implementation",
        "identity-only",
        "internal"
      ],
      [
        "0xDF264E9a02E0D1C1F0b83AE067dE2Bc0031e1e7a",
        "Curve StableSwap Math",
        "library",
        "identity-only",
        "internal"
      ],
      [
        "0x73E5a7225E22682b8Abd5aaE322Ea4ab140Ec652",
        "Curve StableSwap Meta Implementation",
        "implementation",
        "identity-only",
        "internal"
      ],
      [
        "0x9bBc929C45F2C06ccb4acd2C6D9FFE577d505Dfc",
        "Curve StableSwap Views",
        "data-provider",
        "identity-only",
        "internal"
      ],
      [
        "0x729c764aE95e7a9DEA9F950B5AEdbF1A9F3D7c03",
        "Curve TriCrypto Factory",
        "dex-factory",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x016a5D98dC76Fb638F2942E94Fd12b323e792219",
        "Curve TriCrypto Implementation",
        "implementation",
        "identity-only",
        "internal"
      ],
      [
        "0xab53d6899E9c347A5DedDcE3d97D4aeA36B0f8d7",
        "Curve TriCrypto Math",
        "library",
        "identity-only",
        "internal"
      ],
      [
        "0xF1f6e500d9Ccb9F3477cF078A5ea74F75fC3fc96",
        "Curve TriCrypto Views",
        "data-provider",
        "identity-only",
        "internal"
      ],
      [
        "0xa17b39BF1c2FE776Af38a999bE7Bb7bEa737a6EC",
        "Curve TwoCrypto Factory",
        "dex-factory",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x2320f304651F825353124890e4BE17e826BE5841",
        "Curve TwoCrypto Implementation",
        "implementation",
        "identity-only",
        "internal"
      ],
      [
        "0xE8acB9bDd10E9685361a2D540e60378d26b0223f",
        "Curve TwoCrypto Math",
        "library",
        "identity-only",
        "internal"
      ],
      [
        "0xC1a0003b9bFB0C958DA455d12417df0bA79bBA78",
        "Curve TwoCrypto Views",
        "data-provider",
        "identity-only",
        "internal"
      ],
      [
        "0x95cB855840342bE0F023A6A7e6f0A9202BFEfE1b",
        "Curve Child Gauge Factory",
        "gauge-factory",
        "protocol-whitelist",
        "active"
      ],
      [
        "0xc0038FAE184591F21738abF574AC1BFfB5E6C734",
        "Curve Child Gauge Implementation",
        "implementation",
        "identity-only",
        "internal"
      ],
      [
        "0x374D3B496F86416dF0B88830Ad9c59837aA9f078",
        "Curve Deposit and Stake Zap",
        "zap",
        "protocol-whitelist",
        "active"
      ],
      [
        "0xBB56F907e8F455f9f71ed6a394B60ff666a60639",
        "Curve Rate Provider",
        "data-provider",
        "identity-only",
        "internal"
      ],
      [
        "0x3F5A41B922a76759b9C77D36b3d337E88cD1dc5e",
        "Curve Router",
        "dex-router",
        "protocol-whitelist",
        "active"
      ],
      [
        "0xd05b37dFe4c0377dbCb8030eAD07b41888716fE4",
        "Curve StableSwap Meta Zap",
        "zap",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x907CE289E9Ee0BBcb0F69132B1C28A9Affc29FCA",
        "Curve Address Provider",
        "registry",
        "identity-only",
        "internal"
      ],
      [
        "0xB4c6A1e8A14e9Fe74c88b06275b747145DD41206",
        "Curve Meta Registry",
        "registry",
        "identity-only",
        "internal"
      ],
      [
        "0x5601C01a18826126A55A6c9b17b379167116C022",
        "Curve StableSwap Registry Handler",
        "registry",
        "identity-only",
        "internal"
      ],
      [
        "0x2B4d99723b6e1C107b8e1Fe79ce8CA20eaf31F55",
        "Curve TriCrypto Registry Handler",
        "registry",
        "identity-only",
        "internal"
      ],
      [
        "0xDfEaF124262E92837eA2BD94077B1c521701C7B0",
        "Curve TwoCrypto Registry Handler",
        "registry",
        "identity-only",
        "internal"
      ]
    ]
  },
  {
    "protocol": "morpho",
    "reference": "https://docs.morpho.org/developers/contracts/addresses/#morpho-blue/xdc",
    "logoKey": "morpho",
    "deployments": [
      [
        "0xEa49B0fE898aF913A3826F9f462eE2cDcb854fD9",
        "Morpho Blue",
        "lending-pool",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x15c7312B0f26aa0AA70B24a0D2AF87B9e7D614A0",
        "Morpho Adaptive Curve IRM",
        "interest-rate-model",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x6Ad93a3aA829514473D3DF67382894A76c7283B4",
        "Morpho Chainlink Oracle V2 Factory",
        "oracle-factory",
        "identity-only",
        "internal"
      ],
      [
        "0x227544d6989cD15c05AAB6dde4F29523dcfdbe2B",
        "Morpho Vault V2 Factory",
        "vault-factory",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x5C00c99F2235439725417E9f037B7D38FfF35d31",
        "Morpho Market V1 Adapter V2 Factory",
        "adapter-factory",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x79A8C4e9E502C1867cAf2E7202f0C6b89aaCd5c1",
        "Morpho Registry",
        "registry",
        "identity-only",
        "internal"
      ],
      [
        "0xed9bdc3E6081db528b6D5CDDf47EcB05337c62A7",
        "Morpho Bundler3",
        "bundler",
        "protocol-whitelist",
        "active"
      ],
      [
        "0xAB2Ab6A8bb1082C5d8400D6206c6A13cE413e0c0",
        "Morpho General Adapter 1",
        "adapter",
        "protocol-whitelist",
        "active"
      ]
    ]
  },
  {
    "protocol": "oku-uniswap",
    "reference": "https://docs.oku.trade/home/extra-information/deployed-contracts#xdc",
    "logoKey": "uniswap",
    "deployments": [
      [
        "0xcb2436774C3e191c85056d248EF4260ce5f27A9D",
        "Oku Uniswap V3 Core Factory",
        "dex-factory",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x5d6b0f5335ec95cD2aB7E52f2A0750dd86502435",
        "Oku Multicall2",
        "multicall",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x0d922Fb1Bc191F64970ac40376643808b4B74Df9",
        "Oku Proxy Admin",
        "proxy-admin",
        "identity-only",
        "internal"
      ],
      [
        "0xB3309C48F8407651D918ca3Da4C45DE40109E641",
        "Oku Tick Lens",
        "data-provider",
        "identity-only",
        "internal"
      ],
      [
        "0xE3dbcD53f4Ce1b06Ab200f4912BD35672e68f1FA",
        "Oku NFT Descriptor Library",
        "library",
        "identity-only",
        "internal"
      ],
      [
        "0x454050C4c9190390981Ac4b8d5AFcd7aC65eEffa",
        "Oku Position Descriptor",
        "implementation",
        "identity-only",
        "internal"
      ],
      [
        "0x38EB9e62ABe4d3F70C0e161971F29593b8aE29FF",
        "Oku Descriptor Proxy",
        "implementation",
        "identity-only",
        "internal"
      ],
      [
        "0x743E03cceB4af2efA3CC76838f6E8B50B63F184c",
        "Oku Nonfungible Position Manager",
        "position-manager",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x8B3c541c30f9b29560f56B9E44b59718916B69EF",
        "Oku V3 Migrator",
        "migrator",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x6Aa54a43d7eEF5b239a18eed3Af4877f46522BCA",
        "Oku V3 Staker",
        "staking",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x5911cB3633e764939edc2d92b7e1ad375Bb57649",
        "Oku Quoter V2",
        "quoter",
        "identity-only",
        "internal"
      ],
      [
        "0xaa52bB8110fE38D0d2d2AF0B85C3A3eE622CA455",
        "Oku SwapRouter02",
        "dex-router",
        "protocol-whitelist",
        "active"
      ],
      [
        "0xB952578f3520EE8Ea45b7914994dcf4702cEe578",
        "Oku Permit2",
        "permit",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x738fD6d10bCc05c230388B4027CAd37f82fe2AF2",
        "Oku Universal Router",
        "dex-router",
        "protocol-whitelist",
        "active"
      ],
      [
        "0xdD489C75be1039ec7d843A6aC2Fd658350B067Cf",
        "Oku Unsupported Protocol Handler",
        "implementation",
        "identity-only",
        "internal"
      ],
      [
        "0x1b35fba9357fd9bda7ed0429c8bbabe1e8cc88fc",
        "Oku Limit Order Registry",
        "limit-order",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x9db70e29712cc8af10c2b597bada6784544ff407",
        "Oku Master Keeper",
        "keeper",
        "identity-only",
        "internal"
      ]
    ]
  },
  {
    "protocol": "stargate",
    "reference": "https://docs.stargate.finance/resources/contracts/mainnet-contracts#xdc-endpointid-30365",
    "logoKey": "stargate",
    "deployments": [
      [
        "0xef9ec60e186c8A1a0439AF0AedB6dEb9f34A2c88",
        "Stargate Credit Messaging",
        "bridge-messaging",
        "identity-only",
        "internal"
      ],
      [
        "0xa628bb551A3B98d4D3Fd9c4C329005307B9557e9",
        "Stargate Fee Library ETH",
        "library",
        "identity-only",
        "internal"
      ],
      [
        "0x29eE6138DD4C9815f46D34a4A1ed48F46758A402",
        "Stargate Fee Library USDC",
        "library",
        "identity-only",
        "internal"
      ],
      [
        "0xD34e23b4509fF894FA939DC29baC987b7A5465C0",
        "Stargate Fee Library USDT",
        "library",
        "identity-only",
        "internal"
      ],
      [
        "0xa7348290de5cf01772479c48D50dec791c3fC212",
        "Stargate OFT Token ETH",
        "bridge-token",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x936Ab8C674bcb567CD5dEB85D8A216494704E9D8",
        "Stargate OFT Wrapper",
        "bridge-wrapper",
        "protocol-whitelist",
        "active"
      ],
      [
        "0xB0d27478A40223e427697Da523c6A3DAF29AaFfB",
        "Stargate OFT ETH",
        "bridge-token",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x8E2E38711080bF8AAb9C74f434d2bae70e67ae44",
        "Stargate OFT USDC",
        "bridge-token",
        "protocol-whitelist",
        "active"
      ],
      [
        "0xA4272ad93AC5d2FF048DD6419c88Eb4C1002Ec6b",
        "Stargate OFT USDT",
        "bridge-token",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x2761c39102BCF7fc6365580d94cd1882F9cc2650",
        "Stargate Token Messaging",
        "bridge-messaging",
        "identity-only",
        "internal"
      ],
      [
        "0x67B302E35Aef5EEE8c32D934F5856869EF428330",
        "Stargate Treasurer",
        "treasurer",
        "identity-only",
        "internal"
      ]
    ]
  }
];

export const xdcProtocolRegistryEntries: readonly ContractRegistryEntry[] =
  groups.flatMap((group) =>
    group.deployments.map(
      ([address, label, role, trustPolicy, lifecycle]) => ({
        chainId: 50,
        address: address as Address,
        label,
        protocol: group.protocol,
        category: "protocol",
        role,
        source: "protocol-documentation",
        reference: group.reference,
        verification: "publisher-documented-bytecode-present",
        reviewedAt: REVIEWED_AT,
        logoKey: group.logoKey,
        executionRole: null,
        trustPolicy,
        lifecycle,
      }),
    ),
  );
