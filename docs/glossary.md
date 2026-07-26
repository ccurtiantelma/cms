# Glossario

> Dizionario dei termini usati nel progetto. Sezione core (auth/RBAC) valida per
> tutti i progetti che ereditano lo starter-kit. Sezione di dominio da compilare
> per ogni progetto verticale.

---

## Termini core — RBAC / Autenticazione

| Termine | Significato |
|---|---|
| **Ruolo** | Livello di privilegio assegnato a un utente, espresso come intero (`AppUserRoles`). Numero minore = privilegio maggiore. |
| **SuperAdmin** | Ruolo massimo (`5`). Unico ruolo abilitato a impersonificare altri utenti, eseguire seed/reset demo. |
| **Admin** | Ruolo (`10`). Gestisce utenti e audit log del proprio scope, non può creare/gestire SuperAdmin. |
| **Manager** | Ruolo (`20`). Soglia intermedia, usata da guard applicative del progetto verticale. |
| **User** | Ruolo base (`30`). Utente operativo senza privilegi amministrativi. |
| **Scope / tenant** | Perimetro dati di un utente (filiale, ufficio, cliente...). Campo `scopeId` nullable su `users`. Applicato in query con `Utils.applyScopeFilter(authInfo)`. |
| **Guid** | Identificativo pubblico a 16 caratteri esadecimali usato in tutte le URL al posto dell'`id` numerico sequenziale. |
| **Soft delete** | Disattivazione logica di un record (`isActive = false`) invece di cancellazione fisica. Obbligatorio su entità anagrafiche. |
| **MFA / TOTP** | Autenticazione a due fattori basata su codice temporaneo (Time-based One-Time Password, RFC 6238), compatibile con app authenticator standard. |
| **Impersonificazione** | Un SuperAdmin opera nel sistema "vestendo" l'identità di un altro utente per assistenza/debug, tracciata nel JWT (`impersonatedBy`) e nell'audit log. |
| **Audit log** | Registro immutabile delle azioni sensibili (chi, cosa, quando, da quale IP), consultabile da Admin+. |
| **Access token** | JWT di breve durata (default 15 minuti) usato per autenticare le richieste API. |
| **Refresh token (rtk)** | Token opaco di lunga durata (default 7 giorni), veicolato in cookie httpOnly firmato, con rotation ad ogni utilizzo. |
| **Allowlist di sessione** | Chiave Redis (`login:${accessToken}`) che rende un access token effettivamente valido finché non scade o viene revocato al logout. |

---

## Termini di dominio — DA COMPILARE PER IL PROGETTO

> Questa sezione è vuota nello starter-kit. Il progetto verticale che eredita
> questa base deve aggiungere qui i propri termini di dominio (entità, stati,
> processi specifici del business).
