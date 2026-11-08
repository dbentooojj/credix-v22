# Recuperação de backup do Credix

Use um ambiente PostgreSQL 16 isolado. Nunca teste restore diretamente no banco principal. A chave privada de recuperação permanece no seu computador e não deve ser enviada à VPS, ao GitHub ou por e-mail.

## Localizar e baixar

Na VPS, os backups automáticos ficam em `/root/backups/credix/daily`, `monthly` e `yearly`, sempre como `credix-auto-*.dump.age`. O backup manual anterior permanece em `/root/backups/credix/credix_2026-11-07_22-31-14.dump`.

Liste os arquivos sem imprimir conteúdo:

```bash
sudo find /root/backups/credix -maxdepth 2 -type f -printf '%p %s bytes\n'
```

No Windows, baixe somente o arquivo criptografado usando o usuário, porta e chave SSH que funcionam para a VPS. Exemplo para porta 22:

```powershell
scp -i "$env:USERPROFILE\Desktop\credixv2.pem" -o IdentitiesOnly=yes root@92.246.130.69:/root/backups/credix/daily/credix-auto-AAAAMMDDTHHMMSSZ.dump.age "$env:USERPROFILE\Downloads\"
```

Se a cópia veio por e-mail, salve o anexo `.dump.age` em uma pasta privada. Confira nome e tamanho com o corpo do e-mail. Não renomeie o arquivo para `.dump` antes de descriptografar.

## Instalar age em outro computador

No Windows, baixe o executável age para sua arquitetura na página oficial de releases do projeto `FiloSottile/age` no GitHub, valide a origem e coloque `age.exe` no PATH. No Ubuntu, `sudo apt-get update && sudo apt-get install age`.

Confirme a versão com `age --version`. Guarde uma cópia offline protegida de `%USERPROFILE%\Documents\Credix-Seguro\credix-recovery.key` antes de precisar restaurar; não coloque a chave no repositório.

## Descriptografar e validar

No Windows PowerShell, ajuste o nome do anexo baixado:

```powershell
age.exe -d -i "$env:USERPROFILE\Documents\Credix-Seguro\credix-recovery.key" -o "$env:USERPROFILE\Downloads\credix-recovery.dump" "$env:USERPROFILE\Downloads\credix-auto-AAAAMMDDTHHMMSSZ.dump.age"
```

O comando precisa terminar sem erro. Em seguida, valide o dump com `pg_restore --list credix-recovery.dump` e `pg_restore --file NUL credix-recovery.dump` no computador que tenha as ferramentas do PostgreSQL 16. No Linux use `/dev/null` no lugar de `NUL`.

## Restaurar em banco novo

Em um PostgreSQL 16 de recuperação, crie um banco vazio e distinto do banco principal. A sequência abaixo é para um ambiente de testes, com `PGHOST`, `PGUSER` e autenticação já configurados no terminal:

```bash
createdb credix_recovery_test
pg_restore --exit-on-error --no-owner --no-privileges -d credix_recovery_test credix-recovery.dump
psql -d credix_recovery_test -c 'SELECT count(*) FROM "User";'
psql -d credix_recovery_test -c 'SELECT count(*) FROM "Client";'
psql -d credix_recovery_test -c 'SELECT count(*) FROM "Loan";'
psql -d credix_recovery_test -c 'SELECT count(*) FROM "Installment";'
psql -d credix_recovery_test -c 'SELECT count(*) FROM "Payment";'
```

Confira também `_prisma_migrations` e se os empréstimos vinculados a simulações apontam ao mesmo cliente. Compare as contagens com a data do backup. Quando terminar o teste, proteja ou elimine o dump descriptografado; ele contém dados reais em texto claro.

Se o repositório estiver disponível no ambiente de recuperação, `psql -At -d credix_recovery_test -f ops/backup/verify_restore.sql` mostra a contagem exata de todas as tabelas públicas. Compare com as contagens registradas na origem no momento do backup.
