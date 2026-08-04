# API Documentation: List Tournaments

## Endpoint
**GET** `/tournaments.json`

Get a list of tournaments organized by the owner of the API key or OAuth grantor.

## Authentication
The API supports two methods of authentication. Use the `Authorization` header for both.

* **API Key (v1):** `Authorization: <YOUR_API_KEY>`
* **OAuth 2.0 (v2):** `Authorization: Bearer <YOUR_ACCESS_TOKEN>`
    * **Authorize URL:** `https://api.challonge.com/oauth/authorize`
    * **Token URL:** `https://api.challonge.com/oauth/token`

## Headers
| Name | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `Content-Type` | Yes | `application/vnd.api+json` | Resource format |
| `Accept` | Yes | `application/json` | Expected response format |
| `Authorization-Type` | Yes | `v1` | Set to `v2` if using OAuth2 |
| `If-None-Match` | No | - | ETag caching key |

## Query Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `community_id` | string | Optional | Subdomain or permalink. If set, scopes to community. Alternative: `/v2.1/communities/{community_id}/` |
| `page` | integer | Optional | Page number (Default: 1) |
| `per_page` | integer | Optional | Items per page (Default: 25) |
| `state` | enum | Optional | `pending`, `in_progress`, `ended` |
| `type` | enum | Optional | Tournament format (see TypeScript Enums below) |
| `created_after` | string | Optional | Format: `mm/dd/yyyy` |
| `created_before`| string | Optional | Format: `mm/dd/yyyy` |

---

## Data Models (TypeScript)

```typescript
export interface ListTournamentsParams {
    /**
     * If the tournament belongs to a community, you **must** include the community's subdomain
     * or permalink as this parameter for proper scoping.
     */
    community_id?: string;
    /** Format: (mm/dd/yyyy) */
    created_after?: string;
    /** Format: (mm/dd/yyyy) */
    created_before?: string;
    page?: number;
    per_page?: number;
    state?: State;
    type?: Type;
    [property: string]: any;
}

/**
 * State of the Tournament
 */
export enum State {
    Ended = "ended",
    InProgress = "in_progress",
    Pending = "pending",
}

/**
 * Tournament Type
 */
export enum Type {
    DoubleElimination = "double_elimination",
    FreeForAll = "free_for_all",
    GrandPrix = "grand_prix",
    RoundRobin = "round_robin",
    SingleElimination = "single_elimination",
    Swiss = "swiss",
    TimeTrail = "time_trail",
}