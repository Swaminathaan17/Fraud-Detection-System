# Fraud Detection Service

A small Spring Boot API that flags transactions for large amounts, duplicate
transaction IDs, and rapid activity from the same user — persisted to an
Excel file (`data/transactions.xlsx`) acting as a dummy database.

## Requirements
- Java 17+
- Maven 3.8+

## Run it

```bash
mvn spring-boot:run
```

The API starts on `http://localhost:8080`, and the dashboard is served from
the same place — open **http://localhost:8080** in a browser and it's ready,
no separate frontend step needed. A `data/` folder is created next to
wherever you run the app, containing `transactions.xlsx` — this is the
"database"; delete the file to reset it.

To use a different location for the data file:

```bash
mvn spring-boot:run -Dspring-boot.run.jvmArguments="-Dtransactions.file=/path/to/file.xlsx"
```

## Endpoints

| Method | Path                          | Description                        |
|--------|-------------------------------|-------------------------------------|
| POST   | `/api/transactions`           | Record a transaction, get its assessment |
| GET    | `/api/transactions`           | List all transactions              |
| GET    | `/api/transactions/{id}`      | Get one transaction                |
| GET    | `/api/transactions/user/{userName}` | List a user's transactions   |
| GET    | `/api/fraud`                  | List only flagged transactions     |
| GET    | `/api/statistics`             | Totals, fraud count, fraud rate    |

Example request:

```bash
curl -X POST http://localhost:8080/api/transactions \
  -H "Content-Type: application/json" \
  -d '{"userName": "r.iyer", "amount": 75000}'
```

## Frontend

`src/main/resources/static/index.html` is the dashboard — Spring Boot serves
it automatically at `http://localhost:8080`. It calls the API at a
same-origin relative path, so no CORS setup is needed for this bundled
setup. The same file can also be opened directly as a standalone local file
(e.g. double-clicked outside this project); in that case it falls back to
calling `http://localhost:8080/api` explicitly and to an in-browser demo
mode if no backend is reachable.
