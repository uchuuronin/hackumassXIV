# Putting the relay on a name, with HTTPS

Why: today the extension talks to `http://64.177.52.26`. Nothing is encrypted on the way, and the reply links in the "I'm stuck" email point at a bare number. A name with HTTPS fixes both, and the name is also what the domain prize is judged on.

About 30 to 45 minutes. Nothing here has been run on the real server, so go one step at a time and check each.

## 1. A name

Register the domain (ask the MLH table for the GoDaddy Registry code and which endings count). In its DNS settings add two A records, both pointing at `64.177.52.26`:

- `api` (so `api.YOUR-DOMAIN.TLD`)
- `@` (the bare name), and `www` if you want it

Check from your own computer, and wait until it answers with the number:

```
nslookup api.YOUR-DOMAIN.TLD
```

## 2. See what answers on port 80 now

On the server:

```
sudo ss -ltnp | grep -E ':80 |:443 |:3000 '
```

- If the relay itself is on port 80 (it was started with `PORT=80`): change it to `PORT=3000` in its `.env` and restart it. Caddy takes over 80 and 443.
- If nginx or something else is on 80 and passes to the relay: stop and disable it (`sudo systemctl disable --now nginx`), and note which port the relay is on. Use that port in the Caddyfile instead of 3000.

## 3. Caddy

```
sudo apt install -y caddy
```

Copy `relay/Caddyfile.example` to `/etc/caddy/Caddyfile`, replace `YOUR-DOMAIN.TLD` in it, then:

```
sudo systemctl reload caddy
```

The firewall must let 80 and 443 in (Vultr's firewall group, and `sudo ufw allow 80,443/tcp` if ufw is on).

## 4. Tell the relay its new address

In the relay's `.env`:

```
PUBLIC_URL=https://api.YOUR-DOMAIN.TLD
```

`ALLOWED_ORIGIN` stays as it is: it is the extension's ID, not the server's address. Restart the relay.

## 5. Check, in this order

```
curl https://api.YOUR-DOMAIN.TLD/health
curl http://64.177.52.26/health
```

Both should say `{"ok":true}`. The second proves that copies of the extension built before the change still work.

## 6. Point the extension at the name

One line, in `src/helper/relay.ts`:

```ts
export const RELAY_URL = 'https://api.YOUR-DOMAIN.TLD';
```

Build, reload the extension, ask Milo a question, press "I'm stuck" once (the reply link in the email should now start with `https://api.`).

## If something goes wrong

Put `PORT` back to what it was, `sudo systemctl stop caddy`, restart the relay. The extension still points at the number until step 6, so nothing a user sees changes before then.
