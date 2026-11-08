# Backup automático do PostgreSQL

Serviço separado dos processos backend e frontend. Usa apenas Docker, Python 3, age e systemd. A instalação não ativa o timer.

Na VPS atual, a Serverspace bloqueia conexões SMTP de saída nas portas 465 e 587. O timer deve permanecer desativado até existir um canal externo de envio testado. O modo `--backup-only` permite validar o backup criptografado sem envio nem limpeza de retenção.

## Configuração na VPS

1. Copie este diretório para a VPS, por exemplo para `/root/credix-backup-setup`, e execute `sudo bash install.sh` a partir dele. O instalador não toca no backup manual já presente em `/root/backups/credix`.
2. Crie `/etc/credix-backup/smtp.json` a partir de `smtp.example.json`, com dono `root` e modo `0600`. Use as credenciais SMTP no arquivo da VPS, sem incluí-las no Git ou em mensagens. O serviço pode usar o mesmo provedor das notificações do Credix, mas não depende do backend. Defina o destinatário real e ajuste `max_message_bytes` ao limite do provedor.
3. Instale sua chave pública age em `/etc/credix-backup/recipient.txt`, com dono `root` e modo `0600`, a partir de um arquivo fora do repositório. Confira o conteúdo antes do primeiro backup. Nenhuma chave deve ser adicionada ao GitHub; a chave privada de recuperação nunca deve ser copiada para a VPS.

```bash
sudo install -m 0600 -o root -g root /caminho/privado/recipient.txt /etc/credix-backup/recipient.txt
sudo install -m 0600 -o root -g root /caminho/seguro/smtp.json /etc/credix-backup/smtp.json
sudo systemd-analyze calendar '*-*-* 03:00:00 America/Sao_Paulo'
sudo systemd-analyze verify /etc/systemd/system/credix-backup.service /etc/systemd/system/credix-backup.timer
```

## Testes antes da ativação

1. Confirme `docker inspect credix_db`, espaço livre e `docker image inspect postgres:16-alpine`.
2. Execute `sudo /usr/local/libexec/credix-backup/credix_backup.py --backup-only` para testar o dump completo, a leitura com `pg_restore` e a criptografia age. Esse modo não envia e-mail nem remove backups antigos. Não reinicia contêineres nem escreve no banco.
3. Depois de configurar um canal SMTP funcional, execute `sudo /usr/local/libexec/credix-backup/credix_backup.py --run` e confirme o recebimento do anexo `.dump.age`, incluindo nome e tamanho. Se houver limite de e-mail, a execução falha com mensagem de tamanho e mantém a cópia criptografada local. Nesse caso, escolha armazenamento externo privado antes de ativar o timer.
   Confirme também que a caixa postal não elimina automaticamente essas mensagens e tem capacidade para a retenção desejada; o envio SMTP não controla a retenção da caixa externa.
4. Baixe uma cópia criptografada para um computador que tenha sua chave privada. Siga [BACKUP_RECOVERY.md](../../BACKUP_RECOVERY.md) para descriptografar e restaurar em um banco isolado. Use `verify_restore.sql` para conferir as contagens de todas as tabelas.
5. Rode `sudo /usr/local/libexec/credix-backup/credix_backup.py --retention-dry-run` e confira os candidatos de limpeza. Esse modo não apaga nada.
6. Confirme o resultado de `systemd-analyze calendar` e `systemctl list-timers --all credix-backup.timer`.

Somente após confirmar destinatário, SMTP, e-mail recebido e recuperação em banco isolado, ativar:

```bash
sudo systemctl enable --now credix-backup.timer
sudo systemctl status credix-backup.timer
sudo systemctl list-timers --all credix-backup.timer
```

## Operação

Backup manual: `sudo systemctl start credix-backup.service`.

Logs: `sudo journalctl -u credix-backup.service -n 100 --no-pager`.

Arquivos automáticos: `/root/backups/credix/{daily,monthly,yearly}/credix-auto-*.dump.age`. O backup manual existente na raiz do diretório é preservado. O script só remove nomes automáticos reconhecidos dentro das três pastas.

Retenção: 30 datas diárias (incluindo hoje), 12 meses correntes e 5 anos correntes. A primeira cópia validada de cada mês e ano é preservada antes da limpeza diária. O último arquivo automático nunca entra no plano de remoção. Arquivos manuais e desconhecidos não entram na limpeza.

O timer executa às 03:00 em `America/Sao_Paulo` e recupera uma execução perdida após reinicialização. O script usa trava exclusiva para impedir simultaneidade. Em falhas, o serviço termina com erro e registra apenas evento e tipo de falha no journal.
