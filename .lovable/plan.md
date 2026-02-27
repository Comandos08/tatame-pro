
## Remover estado morto `_errorMessage` do AutoImpersonationResolver

### Contexto
O estado `_errorMessage` e `setErrorMessage` sao escritos em 6 locais mas nunca lidos pela UI. O componente usa i18n keys via `BlockedStateCard` para exibir erros.

### Alteracoes em `src/components/impersonation/AutoImpersonationResolver.tsx`

**1. Linha 56** — Remover declaracao do estado:
```
const [_errorMessage, setErrorMessage] = useState<string | null>(null);
```

**2. Linha 72** — Remover `setErrorMessage('MISSING_TENANT_SLUG');`

**3. Linha 89** — Remover `setErrorMessage('TENANT_LOOKUP_FAILED');`

**4. Linha 96** — Remover `setErrorMessage('TENANT_NOT_FOUND');`

**5. Linha 103** — Remover `setErrorMessage('TENANT_INACTIVE');`

**6. Linha 116** — Remover `setErrorMessage('IMPERSONATION_START_FAILED');`

**7. Linha 121** — Remover `setErrorMessage('UNEXPECTED_ERROR');`

**8. Linha 193** — No handler de retry do ERROR case, remover `setErrorMessage(null);` (manter `setStatus('IDLE')`)

### O que NAO muda
- Estado `status` e sua maquina de estados
- Guards (`inFlightRef`, check de `status !== 'IDLE'`)
- Fluxo IDLE -> RESOLVING -> RESOLVED/ERROR
- Navegacao e UI
- Acoes do BlockedStateCard
- Logger calls (continuam registrando os codigos de erro)
