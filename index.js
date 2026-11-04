module.exports = function SyncEmotes(dispatch) {
    const command = dispatch.command || dispatch.require.command;
    const names = new Map();
    const emoteAt = new Map();
    const timers = new Set();
    let enabled = false;
    let myId = null;
    let current = null;
    let locked = null;
    let lastEmoter = null;
    let listed = [];
    let delay = 0;

    const TR = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z',
        'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
        'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
    };

    const key = v => (v === undefined || v === null) ? null : String(v);
    const latin = s => Array.from(String(s).toLowerCase()).map(c => TR[c] !== undefined ? TR[c] : c).join('');
    const label = id => {
        const n = names.get(id) || id;
        const l = latin(n);
        return l === String(n).toLowerCase() ? n : n + ' (' + l + ')';
    };

    function targetId() {
        return locked || current;
    }

    function showList(ids) {
        listed = ids.slice(0, 12);
        if (!listed.length) {
            command.message('(sync-emotes) Aucun joueur');
            return;
        }
        listed.forEach((id, i) => command.message((i + 1) + '. ' + label(id)));
        command.message('(sync-emotes) /toolbox sync [numero]');
    }

    function lockOn(id) {
        locked = id;
        enabled = true;
        command.message('(sync-emotes) Enabled, verrouille sur ' + label(id));
    }

    function search(query) {
        const q = query.toLowerCase();
        const out = [];
        for (const [id, nm] of names) {
            if (id === myId) continue;
            if (nm.toLowerCase().includes(q) || latin(nm).includes(q)) out.push(id);
        }
        return out;
    }

    dispatch.hook('S_LOGIN', '*', e => {
        myId = key(e.gameId);
        names.clear();
        emoteAt.clear();
        current = null;
        locked = null;
        lastEmoter = null;
        listed = [];
    });

    dispatch.hook('S_SPAWN_USER', '*', e => {
        names.set(key(e.gameId), e.name);
    });

    dispatch.hook('S_DESPAWN_USER', '*', e => {
        const id = key(e.gameId);
        names.delete(id);
        emoteAt.delete(id);
        if (locked === id) {
            locked = null;
            command.message('(sync-emotes) Cible partie, verrouillage leve');
        }
        if (lastEmoter === id) lastEmoter = null;
    });

    dispatch.hook('C_SET_TARGET_INFO', '*', e => {
        const id = key(e.target);
        current = (id && id !== '0') ? id : null;
    });

    dispatch.hook('S_SOCIAL', '*', e => {
        const who = key(e.target);
        if (who === myId || !names.has(who)) return;
        lastEmoter = who;
        emoteAt.set(who, Date.now());
        if (!enabled || who !== targetId()) return;
        const send = () => dispatch.toServer('C_SOCIAL', '*', { emote: e.animation, unk: 0 });
        if (delay > 0) {
            const t = setTimeout(() => {
                timers.delete(t);
                send();
            }, delay);
            timers.add(t);
        } else {
            send();
        }
    });

    command.add('sync', arg => {
        if (arg === 'off' || (!arg && enabled)) {
            enabled = false;
            locked = null;
            command.message('(sync-emotes) Disabled');
            return;
        }
        if (!arg) {
            enabled = true;
            command.message('(sync-emotes) Enabled' + (current ? ', cible: ' + label(current) : ', cible un joueur'));
            return;
        }
        if (arg === 'lock') {
            if (!current) {
                command.message('(sync-emotes) Cible un joueur d\'abord');
                return;
            }
            lockOn(current);
            return;
        }
        if (/^\d+$/.test(arg)) {
            const id = listed[Number(arg) - 1];
            if (!id || !names.has(id)) {
                command.message('(sync-emotes) Numero invalide, tape /toolbox synclist');
                return;
            }
            lockOn(id);
            return;
        }
        const found = search(arg);
        if (found.length === 1) {
            lockOn(found[0]);
        } else if (found.length === 0) {
            command.message('(sync-emotes) Aucun joueur pour: ' + arg);
        } else {
            command.message('(sync-emotes) Plusieurs joueurs, choisis un numero');
            showList(found);
        }
    });

    command.add('synclist', () => {
        const ids = Array.from(names.keys()).filter(id => id !== myId);
        ids.sort((a, b) => (emoteAt.get(b) || 0) - (emoteAt.get(a) || 0));
        showList(ids);
    });

    command.add('synclast', () => {
        if (!lastEmoter || !names.has(lastEmoter)) {
            command.message('(sync-emotes) Personne n\'a fait d\'emote');
            return;
        }
        lockOn(lastEmoter);
    });

    command.add('syncdelay', ms => {
        delay = Math.max(0, Math.min(Number(ms) || 0, 5000));
        command.message('(sync-emotes) Delai: ' + delay + ' ms');
    });

    this.destructor = () => {
        for (const t of timers) clearTimeout(t);
        timers.clear();
    };
};