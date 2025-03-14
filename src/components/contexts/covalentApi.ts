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
    isAlchemyApi: true,
    getBalance: async (address: string): Promise<LegacyBalance[]> => {

      console.log("alchemyApi", address, chainId, tokens.length);

      const network = chainIdToAlchemyNetwork[chainId];
      if (!network) throw new Error(`Unsupported alchemyApi chain ID: ${chainId}`);

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

      console.log("alchemyApi response", response);

      const chain = ChainIdToChain[chainId];
      
      return response.result.tokenBalances
        .map(token => {
          // Find token by address AND matching chain
          const tokenInfo = tokens.find(t => 
            t.address?.toLowerCase() === token.contractAddress?.toLowerCase() && 
            t.chain === chain
          );
          
          if (!tokenInfo) {
            console.log(`Token not found in list: ${token.contractAddress} on chain ${chain}`, tokens.length);
            return null;
          }

          console.log("token found", tokenInfo);

          // Format to match the covalentApi return structure
          return {
            value: formatBigIntToSafeValue({
              value: BigInt(token.tokenBalance),
              decimal: tokenInfo.decimals,
              bigIntDecimal: tokenInfo.decimals,
            }),
            decimal: tokenInfo.decimals,
            chain: chain,
            symbol: `${tokenInfo.ticker || "Unknown"}${false ? "" : `-${token.contractAddress}`}`,
          };
        })
        .filter(Boolean) as LegacyBalance[];
    }
  });
