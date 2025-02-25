import { RequestClient, ChainId } from "@swapkit/helpers";
import { formatBigIntToSafeValue } from "@swapkit/helpers";
import { ChainIdToChain } from "@swapkit/helpers";
import { LegacyBalance } from "@swapkit/helpers";
const chainIdToAlchemyNetwork = {
  [ChainId.Ethereum]: 'eth-mainnet',
  [ChainId.Optimism]: 'opt-mainnet',
  [ChainId.Polygon]: 'polygon-mainnet',
  [ChainId.Arbitrum]: 'arb-mainnet',
  [ChainId.Base]: 'base-mainnet'
} as const;

interface AlchemyTokenBalance {
  contractAddress: string;
  tokenBalance: string;
}

interface AlchemyResponse {
  jsonrpc: "2.0";
  id: number;
  result: {
    address: string;
    tokenBalances: AlchemyTokenBalance[];
  };
}

interface TokenInfo {
  address: string;
  decimals: number;
  symbol: string;
  chain: string;
}

interface AlchemyApiConfig {
  apiKey: string;
  chainId: ChainId;
  tokens: TokenInfo[];
}

// Modified to accept tokens directly instead of a ref
export const alchemyApi = ({ tokens, apiKey }: { tokens: TokenInfo[]; apiKey: string }) => 
  (chainId: ChainId) => ({
    getBalance: async (address: string): Promise<LegacyBalance[]> => {
      const network = chainIdToAlchemyNetwork[chainId];
      if (!network) throw new Error(`Unsupported chain ID: ${chainId}`);

      const response = await RequestClient.post<AlchemyResponse>(
        `https://${network}.g.alchemy.com/v2/${apiKey}`,
        {
          body: JSON.stringify({
            id: 1,
            jsonrpc: "2.0",
            method: "alchemy_getTokenBalances",
            params: [address, "erc20"]
          }),
          headers: {
            "accept": "application/json",
            "content-type": "application/json"
          }
        }
      );

      return response.result.tokenBalances
        .filter(token => BigInt(token.tokenBalance) > 0n)
        .map(token => {
          const tokenInfo = tokens.find(t => 
            t.address.toLowerCase() === token.contractAddress.toLowerCase()
          );
          
          if (!tokenInfo) return null;

          return {
            value: formatBigIntToSafeValue({
              value: BigInt(token.tokenBalance),
              decimal: tokenInfo.decimals,
              bigIntDecimal: tokenInfo.decimals,
            }),
            decimal: tokenInfo.decimals,
            chain: ChainIdToChain[chainId],
            ticker: tokenInfo.symbol,
            address: token.contractAddress,
            isNative: false
          };
        })
        .filter(Boolean) as LegacyBalance[];
    }
  });
