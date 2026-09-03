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
  },

  {
    "protocol": "silo",
    "reference": "https://github.com/silo-finance/silo-contracts-v3/tree/31b98b3b899494ebfbd6306d17f50666480967bd/silo-core/deployments/xdc",
    "logoKey": "silo",
    "deployments": [
      [
        "0x504B8ca9C664AFe72324388122caBAFb72F9269f",
        "Silo Dynamic Kink Model Factory",
        "interest-rate-model",
        "identity-only",
        "internal"
      ],
      [
        "0x4FD711B72Df2f568682a62Ff9f95448BAaE2dCD2",
        "Silo Global Pause",
        "control",
        "identity-only",
        "internal"
      ],
      [
        "0xb1d1B13015c116D3814646c687EA9280374603d4",
        "Silo Interest Rate Model V2",
        "interest-rate-model",
        "identity-only",
        "internal"
      ],
      [
        "0x6ac197a9Dea6E956e5591fA25Ce27848832cfB30",
        "Silo Interest Rate Model V2 Factory",
        "interest-rate-model",
        "identity-only",
        "internal"
      ],
      [
        "0xe3aE3f11D2aFD7031D3C92774166571b057E8A87",
        "Silo Leverage Router",
        "lending-router",
        "protocol-whitelist",
        "active"
      ],
      [
        "0xCEdbCa44a243fF5F67857AA242aAf039465e52Ab",
        "Silo Liquidation Helper LI FI",
        "liquidation-helper",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x08A52Ec31E0E981bBd64082224185e420d3f9849",
        "Silo Manual Liquidation Helper",
        "liquidation-helper",
        "protocol-whitelist",
        "active"
      ],
      [
        "0xa5478C6dB3d9c25051bCad3dC23BA0a165b82189",
        "Silo Permissioned Liquidation Controller Factory",
        "liquidation-helper",
        "identity-only",
        "internal"
      ],
      [
        "0xe07783619264e1AffBB309b6aa4C54139B1356BE",
        "Silo Share Debt Token",
        "token",
        "identity-only",
        "internal"
      ],
      [
        "0x7F736F08A1e0fbA121f7fAe7887Be31dE7B08a47",
        "Silo Share Protected Collateral Token",
        "token",
        "identity-only",
        "internal"
      ],
      [
        "0x72ED066BB31F4a53081fb6Aec8caE602AD039a5d",
        "Silo Silo",
        "helper",
        "identity-only",
        "internal"
      ],
      [
        "0x78330cde63134058D0E6322adc1F893Ce954f944",
        "Silo Silo Deployer",
        "lending-factory",
        "identity-only",
        "internal"
      ],
      [
        "0xf81d90DF1B63d48536E78564d24d5DD8F2BE58aD",
        "Silo Silo Factory",
        "lending-factory",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x49196144791C7564D56E80C055702AEBeE9A9811",
        "Silo Silo Hook V1",
        "implementation",
        "identity-only",
        "internal"
      ],
      [
        "0x1157dE9f428231DDa3c3Ab282f02259178FBF779",
        "Silo Silo Hook V2",
        "implementation",
        "identity-only",
        "internal"
      ],
      [
        "0xCA1658fe7c04E7CF739c3072A1f60948506Efd83",
        "Silo Silo Hook V3",
        "implementation",
        "identity-only",
        "internal"
      ],
      [
        "0x7BD4d72D14fAD915DF0aCD2564982ea4D853b83f",
        "Silo Silo Incentives Controller Factory",
        "lending-factory",
        "protocol-whitelist",
        "active"
      ],
      [
        "0xee6845d30c2529BA0a9A1adFfa06C377FE2DDEdd",
        "Silo Silo Lens",
        "data-provider",
        "identity-only",
        "internal"
      ],
      [
        "0x4fFf70C17fb974121a1Ad64C97b04a2e38DbfE7C",
        "Silo Silo Router V2",
        "lending-router",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x1f39ed01Ac23A1abc4038E87291d4E9FF599B7FE",
        "Silo Tower",
        "control",
        "identity-only",
        "internal"
      ]
    ]
  },
  {
    "protocol": "silo",
    "reference": "https://github.com/silo-finance/silo-contracts-v3/tree/31b98b3b899494ebfbd6306d17f50666480967bd/silo-oracles/deployments/xdc",
    "logoKey": "silo",
    "deployments": [
      [
        "0xB477131cf512fE4D2F46888B7A352763a168a30C",
        "Silo Chainlink V3 Oracle Factory",
        "oracle-factory",
        "identity-only",
        "internal"
      ],
      [
        "0xdE3a6c3c7A8F0534aD0756bDc17A9BF6A0da633A",
        "Silo Custom Method Oracle Factory",
        "oracle-factory",
        "identity-only",
        "internal"
      ],
      [
        "0x1A5BbaC2EBb511c1ff60A50A2808b91DB0E30316",
        "Silo Flat Price Oracle Factory",
        "oracle-factory",
        "identity-only",
        "internal"
      ],
      [
        "0xdB91416Ff725FaE365EC92b90806D79cB967C68C",
        "Silo Manageable Oracle Factory",
        "oracle-factory",
        "identity-only",
        "internal"
      ],
      [
        "0x9a5Bb923638A891b212b65bE01AAb3B05160a78b",
        "Silo Oracle Scaler Factory",
        "oracle",
        "identity-only",
        "internal"
      ],
      [
        "0xb49329Bf1d95D51681F4E4F644eB37F58E398Abd",
        "Silo Reverting Oracle",
        "oracle",
        "identity-only",
        "internal"
      ],
      [
        "0x6Ec69E17E1184Ac8209aE03f21939E7960F46BD7",
        "Silo Silo Virtual Asset BTC",
        "token",
        "identity-only",
        "internal"
      ],
      [
        "0x04E209D70F7f834A7a5ab7BD31f48827F0e88049",
        "Silo Silo Virtual Asset EUR",
        "token",
        "identity-only",
        "internal"
      ],
      [
        "0x5992E92a6C8456A25B4718cb74632D72e5b1e494",
        "Silo Silo Virtual Asset USD",
        "token",
        "identity-only",
        "internal"
      ],
      [
        "0xFfD3cB64ec6Fb68432792e4E902F62192a420506",
        "Silo Supra SValue Oracle Factory",
        "oracle-factory",
        "identity-only",
        "internal"
      ],
      [
        "0xdA39759b7A4Fc66bb86C34103f9903253E330B85",
        "Silo Virtual Token Price",
        "token",
        "identity-only",
        "internal"
      ]
    ]
  },
  {
    "protocol": "silo",
    "reference": "https://github.com/silo-finance/silo-contracts-v3/tree/31b98b3b899494ebfbd6306d17f50666480967bd/silo-vaults/deployments/xdc",
    "logoKey": "silo",
    "deployments": [
      [
        "0x8c3024280BF126db4bDbA2B5dE5b22ccCb26db98",
        "Silo Idle Vaults Factory",
        "vault-factory",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x9e6bD1d23339E2719422478cEF4EE4457904301b",
        "Silo Public Allocator",
        "adapter",
        "protocol-whitelist",
        "active"
      ],
      [
        "0xA59340538B5379511594061f7cAc3863d6d1bBdE",
        "Silo Silo Incentives Controller CLDeployer",
        "lending-factory",
        "identity-only",
        "internal"
      ],
      [
        "0x09402f0f9F490E38413A5d4892d1e927acc0aE55",
        "Silo Silo Incentives Controller CLFactory",
        "lending-factory",
        "identity-only",
        "internal"
      ],
      [
        "0xCa22FB764b77661d8D2c3b969E7Aef856795C51C",
        "Silo Silo Vault Deployer",
        "lending-factory",
        "identity-only",
        "internal"
      ],
      [
        "0x2C650C8A97C9D229c391c48ec995792D9A8A0678",
        "Silo Silo Vaults Factory",
        "vault-factory",
        "protocol-whitelist",
        "active"
      ]
    ]
  },
  {
    "protocol": "fathom",
    "reference": "https://docs.fathom.fi/lending/deployments/xdc-network",
    "logoKey": "fathom",
    "deployments": [
      [
        "0x4ccF956B8e601C5958401B4178e3dEA844C0a984",
        "Fathom ACL Admin / Pool Admin / Emergency Admin / Owner of PoolAddressesProvider / Registry / EmissionManager / FmToken treasuries",
        "data-provider",
        "identity-only",
        "internal"
      ],
      [
        "0xDAb3B99eb3569466750c436d6F4c99d57850Cc89",
        "Fathom PoolAddressesProviderRegistry",
        "data-provider",
        "identity-only",
        "internal"
      ],
      [
        "0x37ab83e6a9B99DA3eAF00D1afdC45f50ee7625E5",
        "Fathom PoolAddressesProvider",
        "data-provider",
        "identity-only",
        "internal"
      ],
      [
        "0x70d8005E3c8C7e383FE35Fa40156042F3393449F",
        "Fathom Pool",
        "helper",
        "identity-only",
        "internal"
      ],
      [
        "0x5c756ACD4Cb26a9cA6De7abF9765cE84B5Be9322",
        "Fathom Pool Implementation",
        "implementation",
        "identity-only",
        "internal"
      ],
      [
        "0x56f3A75C71C207a77c3b8c77a34FC89cF1a6DB66",
        "Fathom PoolConfigurator",
        "helper",
        "identity-only",
        "internal"
      ],
      [
        "0xE6525d46ADc3Cd5AF2CfA322504A7C17F8445c8D",
        "Fathom PoolConfigurator Implementation",
        "implementation",
        "identity-only",
        "internal"
      ],
      [
        "0xf73e7d6309A2DaDE5B698eD33dA929d2F2281526",
        "Fathom ACLManager",
        "control",
        "identity-only",
        "internal"
      ],
      [
        "0x7fa488a5C88E9E35B0B86127Ec76B0c1F0933191",
        "Fathom PoolDataProvider",
        "data-provider",
        "identity-only",
        "internal"
      ],
      [
        "0x54348d953Abc4f167cbdeDe648095c1aF7DE355A",
        "Fathom FathomOracle",
        "oracle",
        "identity-only",
        "internal"
      ],
      [
        "0x32A2FdC2A5206320cE697C952c7f4cCDdA2a0294",
        "Fathom FallbackOracle",
        "oracle",
        "identity-only",
        "internal"
      ],
      [
        "0x049F146A33a16e454f3BE28bb0bc18c12C96a894",
        "Fathom EmissionManager",
        "control",
        "identity-only",
        "internal"
      ],
      [
        "0xf5e0C80114C0b0E3c4b55c217643E9a02699bB9b",
        "Fathom IncentivesController",
        "helper",
        "identity-only",
        "internal"
      ],
      [
        "0x32f42b439C63Bc4F27F701CFD5939a5889eA2a00",
        "Fathom IncentivesV2 Implementation",
        "implementation",
        "identity-only",
        "internal"
      ],
      [
        "0x57Ba8bAA7c3Ff6606751859f1CED9f68819C2f41",
        "Fathom WrappedTokenGatewayV3",
        "token",
        "identity-only",
        "internal"
      ],
      [
        "0x7C724DEaD5012Eb4C9e2d1529cF0353e767C82Cd",
        "Fathom WalletBalanceProvider",
        "data-provider",
        "identity-only",
        "internal"
      ],
      [
        "0x5f7001B6Dc957dC5B2F78f0BC3aFbFc1fE628A18",
        "Fathom UiPoolDataProviderV3",
        "data-provider",
        "identity-only",
        "internal"
      ],
      [
        "0xA69c5468Aa4ab263a250fD9dA4322e58370F2bB2",
        "Fathom UiIncentiveDataProviderV3",
        "data-provider",
        "identity-only",
        "internal"
      ],
      [
        "0x5b8483Ab120537A307Df6bB3dD2Bb149091F2AF7",
        "Fathom ReservesSetupHelper",
        "helper",
        "identity-only",
        "internal"
      ],
      [
        "0x5cF8e2326F5c013d568F48E878e9D7ae9557F902",
        "Fathom FlashLiquidator",
        "helper",
        "identity-only",
        "internal"
      ],
      [
        "0x95f2f5fd81815Da3517E1EdfC149EE47c116F904",
        "Fathom FmTokenV2 Implementation",
        "token",
        "identity-only",
        "internal"
      ],
      [
        "0x80e2eA68DB630660eFCa18780F24587967F3071B",
        "Fathom StableDebtToken Implementation",
        "token",
        "identity-only",
        "internal"
      ],
      [
        "0xfaA128B457FC7cBF9763A7Be66bF89662d9777FF",
        "Fathom VariableDebtToken Implementation",
        "token",
        "identity-only",
        "internal"
      ],
      [
        "0xA8f477530036cF1391E5A76A723635be7b28Eff3",
        "Fathom SupplyLogic",
        "library",
        "identity-only",
        "internal"
      ],
      [
        "0x602d170366C4c14c855BAa051A35Ee318564343A",
        "Fathom BorrowLogic",
        "library",
        "identity-only",
        "internal"
      ],
      [
        "0xdf816BB3a1415B4b88365D6Ecb5Fcc52A7ee7729",
        "Fathom LiquidationLogic",
        "liquidation-helper",
        "identity-only",
        "internal"
      ],
      [
        "0x1240f345449Ee3293FEAE9E3e3FbcCe1589e9160",
        "Fathom EModeLogic",
        "library",
        "identity-only",
        "internal"
      ],
      [
        "0x00C1B7ce7703beD7e115833a6c2DbcFeD887a4f1",
        "Fathom BridgeLogic",
        "library",
        "identity-only",
        "internal"
      ],
      [
        "0x373E40f30e7a2CcFfe22fA1926bD71284332a2B9",
        "Fathom ConfiguratorLogic",
        "library",
        "identity-only",
        "internal"
      ],
      [
        "0x57023484830D90027E33e37Abc301A89e1318B30",
        "Fathom FlashLoanLogic",
        "library",
        "identity-only",
        "internal"
      ],
      [
        "0x8c2cf73fB553d9a8a8Dc34A6B5e6078FC023c34F",
        "Fathom PoolLogic",
        "library",
        "identity-only",
        "internal"
      ],
      [
        "0x99E7d2d9B8349B70aae31e5213c54fd022fd5DCF",
        "Fathom rateStrategyVolatileOne",
        "interest-rate-model",
        "identity-only",
        "internal"
      ],
      [
        "0xB34A51D8443219bdA8BFBA5826B7907Bc4032e11",
        "Fathom rateStrategyStableOne",
        "interest-rate-model",
        "identity-only",
        "internal"
      ],
      [
        "0x12936376CCb51877ed2135b985aEe1d011e173CA",
        "Fathom rateStrategyStableTwo",
        "interest-rate-model",
        "identity-only",
        "internal"
      ],
      [
        "0xDAEf7d4000fb0e511C9f2dEEAE602d9c8fcb28f7",
        "Fathom WXDC fmToken",
        "token",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x10eB945e14131Fb55B2F432d826F4e09d718276D",
        "Fathom WXDC VariableDebtToken",
        "token",
        "protocol-whitelist",
        "active"
      ],
      [
        "0xcbf718E6802E646D6d016912453E1ECb1BdB0DcA",
        "Fathom WXDC StableDebtToken",
        "token",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x8d470BDE66eE52981D7D29Bc2e6FCa3b4DC17879",
        "Fathom WXDC Oracle source",
        "oracle",
        "protocol-whitelist",
        "active"
      ],
      [
        "0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1",
        "Fathom USDC Underlying",
        "helper",
        "protocol-whitelist",
        "active"
      ],
      [
        "0xfc751eef339555950A8cb443bb1e3FdD6a3A77eC",
        "Fathom USDC fmToken",
        "token",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x2c58F972225598dd945fdb2D11a998D63e189509",
        "Fathom USDC VariableDebtToken",
        "token",
        "protocol-whitelist",
        "active"
      ],
      [
        "0xa2c3C5b95413F486A07897D288B2a7aA10Db1Cc6",
        "Fathom USDC StableDebtToken",
        "token",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x321F084B78756C5550e6Ab200d88BB2602BCE1A2",
        "Fathom USDC Oracle source",
        "oracle",
        "protocol-whitelist",
        "active"
      ],
      [
        "0x49d3f7543335cf38Fa10889CCFF10207e22110B5",
        "Fathom FXD Underlying",
        "helper",
        "identity-only",
        "deprecated"
      ],
      [
        "0xEC826980367dABBAA28F614B8D0e14548dCca37b",
        "Fathom FXD fmToken",
        "token",
        "identity-only",
        "deprecated"
      ],
      [
        "0xcF5b5C4DfeA09a0Ad129717BfbbCA750c362E795",
        "Fathom FXD VariableDebtToken",
        "token",
        "identity-only",
        "deprecated"
      ],
      [
        "0xe82b0F5CDf092Bf01Ae56898bB35b1E77fc60aC2",
        "Fathom FXD StableDebtToken",
        "token",
        "identity-only",
        "deprecated"
      ],
      [
        "0x03396fE4E58A0778679E2731564f064FA5256C6E",
        "Fathom FXD Oracle source",
        "oracle",
        "identity-only",
        "deprecated"
      ],
      [
        "0xD4B5f10D61916Bd6E0860144a91Ac658dE8a1437",
        "Fathom xUSDT Underlying",
        "helper",
        "identity-only",
        "deprecated"
      ],
      [
        "0x1C3bBc4FA17128711c238Bc50Bd0AE85D35C2515",
        "Fathom xUSDT fmToken",
        "token",
        "identity-only",
        "deprecated"
      ],
      [
        "0x98dC1115ADdcdD2eF67c87D35fAF0b835b3F746D",
        "Fathom xUSDT VariableDebtToken",
        "token",
        "identity-only",
        "deprecated"
      ],
      [
        "0x2F6C3d501cfD528D78c7C1Da3B8Ea37Ba85BDB93",
        "Fathom xUSDT StableDebtToken",
        "token",
        "identity-only",
        "deprecated"
      ],
      [
        "0x8f9920283470F52128bF11B0c14E798bE704fD15",
        "Fathom CGO Underlying",
        "helper",
        "identity-only",
        "deprecated"
      ],
      [
        "0x0947617c830307957FAc8d51b1a9488e756Cf2Cf",
        "Fathom CGO fmToken",
        "token",
        "identity-only",
        "deprecated"
      ],
      [
        "0xa8aFc7a05E54F3027Eb77727d77cc5D3Fe7Bf4Af",
        "Fathom CGO VariableDebtToken",
        "token",
        "identity-only",
        "deprecated"
      ],
      [
        "0x474C64774703f8e5132cc8400d77FA854cA6e219",
        "Fathom CGO StableDebtToken",
        "token",
        "identity-only",
        "deprecated"
      ],
      [
        "0x90473A2Fa1d9eB8fe6C45072D933218f828AF834",
        "Fathom CGO Oracle source",
        "oracle",
        "identity-only",
        "deprecated"
      ],
      [
        "0x3279dBEfABF3C6ac29d7ff24A6c46645f3F4403c",
        "Fathom FTHM Underlying",
        "helper",
        "identity-only",
        "deprecated"
      ],
      [
        "0x103Df67779bf7F1C5cfa2374049E5666D9686b98",
        "Fathom FTHM fmToken",
        "token",
        "identity-only",
        "deprecated"
      ],
      [
        "0x31D83E0cae604F6Ce0a06800DAFe0959449b1947",
        "Fathom FTHM VariableDebtToken",
        "token",
        "identity-only",
        "deprecated"
      ],
      [
        "0x2b0B493CB20C9efAb5b316618D86fe8a790D81dE",
        "Fathom FTHM StableDebtToken",
        "token",
        "identity-only",
        "deprecated"
      ],
      [
        "0xFc2fd5b24B2baEEa13b42809F582aa083cd29409",
        "Fathom FTHM Oracle source",
        "oracle",
        "identity-only",
        "deprecated"
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
