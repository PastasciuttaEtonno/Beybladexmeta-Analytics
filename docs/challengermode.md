# Challengermode API Integration

This project can fetch real past tournaments from the Challengermode public GraphQL API.

## Environment Variables

Configure the following variable in your environment:

- `CHALLENGERMODE_REFRESH_KEY` — The refresh key used to obtain a short-lived access token.

The server POSTs `{ refreshKey: CHALLENGERMODE_REFRESH_KEY }` to `https://publicapi.challengermode.com/mk1/v1/auth/access_keys` to retrieve an access token. That access token is then used as a Bearer token in subsequent GraphQL requests to `https://publicapi.challengermode.com/graphql`. The token is cached until its expiry (with a small safety buffer).

## How It Works

The server exposes `/api/challengermode/tournaments` which fetches tournaments from Challengermode using a query like:

```
query TournamentsForGame {
  tournamentsForGame(
    input: {
      gameSlug: "beybladex"
      tournamentFilter: {
        completedTournamentSelector: { tournamentsAfter: "YYYY-MM-DDTHH:mm:ssZ" }
      }
    }
  ) {
    description
    id
    name
    state
    contactUrl
    idSuffix
    gameTitle { id slug title }
  }
}
```

The server caches the bearer token until expiry (with a small safety buffer) to minimize authentication requests.

## Client Behavior

The Tournaments page consumes the `/api/challengermode/tournaments` endpoint and gracefully handles missing date fields by displaying the tournament `state` when `dataTorneo` is not available.