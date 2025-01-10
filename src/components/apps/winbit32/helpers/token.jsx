
export function getTokenForProvider(tokens, token, provider) {

	const providerBeginsWith = provider.substring(0, 4).toUpperCase();

	console.log('getTokenForProvider', provider, providerBeginsWith, token, tokens);

	const tokenForProvider = tokens.find((t) => {
		return t.provider?.toUpperCase().startsWith(providerBeginsWith) && t.identifier.toUpperCase() === token.identifier.toUpperCase();
		//return t.provider?.toUpperCase() === provider.toUpperCase() && t.identifier.toUpperCase() === token.identifier.toUpperCase();	
		}
	);

	if(!tokenForProvider) {

		return token;

	}else{
		
		return tokenForProvider ;
	}


}