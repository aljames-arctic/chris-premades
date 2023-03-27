import {chris} from '../helperFunctions.js';
import {macros} from '../macros.js';
import {socket} from '../module.js';

let auras = {};

export let effectAuras = {
    'add': add,
    'remove': remove,
    'status': status,
    'purge': purge,
    'registerAll': canvasReady,
    'refresh': refreshEffects
}
function status() {
    return auras;
}
async function purge() {
    auras = {};
    await socket.executeForEveryone('syncEffectAuras', auras);
    return;
}
function add(flagAuras, tokenUuid, doRefresh) {
    if (game.settings.get('chris-premades', 'LastGM') != game.user.id) {
        socket.executeForAllGMs('remoteAddEffectAura', flagAuras, tokenUuid, doRefresh);
        return;
    }
    for (let aura of Object.values(flagAuras)) {
        let name = aura.name;
        let castLevel = aura.castLevel || 0;
        let spellDC = aura.spellDC || null;
        let range = aura.range;
        let disposition = aura.disposition || 'all';
        let conscious = aura.conscious || false;
        let effectName = aura.effectName;
        let effectData = aura.effectData;
        let macroName = aura.macroName;
        if (!tokenUuid || !name || !range || !effectName || (!macroName && !effectData)) {
            ui.notifications.warn('Invalid aura data found!');
            console.log(aura);
            continue;
        }
        if (!auras[name]) auras[name] = [];
        auras[name].push({
            'tokenUuid': tokenUuid,
            'name': name,
            'castLevel': castLevel,
            'spellDC': spellDC,
            'range': range,
            'disposition': disposition,
            'conscious': conscious,
            'effectData': effectData,
            'macroName': macroName,
            'effectName': effectName
        });
    }
    if (doRefresh) refreshEffects();
}
function remoteAdd(flagAuras, tokenUuid, doRefresh) {
    if (game.settings.get('chris-premades', 'LastGM') != game.user.id) return;
    add(flagAuras, tokenUuid, doRefresh);
}
async function remove(name, tokenUuid) {
    if (game.settings.get('chris-premades', 'LastGM') != game.user.id) {
        socket.executeForAllGMs('remoteRemoveEffectAura', name, tokenUuid);
        return;
    }
    if (!auras[name]) return;
    await refreshEffects(tokenUuid, name);
    auras[name] = auras[name].filter(aura => aura.tokenUuid != tokenUuid);
    if (auras[name].length === 0) delete(auras[name]);
}
async function remoteRemove(name, tokenUuid) {
    if (game.settings.get('chris-premades', 'LastGM') != game.user.id) return;
    await remove(name, tokenUuid);
}
function preActorUpdate(actor, updates, options) {
    if (game.settings.get('chris-premades', 'LastGM') != game.user.id) return;
    if (!actor.flags['chris-premades']?.aura) return;
    if (!updates.system?.attributes?.hp) return;
    let oldHP = actor.system.attributes.hp.value;
    let newHP = updates.system.attributes.hp.value;
    if (oldHP > 0 && newHP === 0) foundry.utils.setProperty(options, 'chris-premades.refreshAuras', true);
    if (newHP > 0 && oldHP === 0) foundry.utils.setProperty(options, 'chris-premades.refreshAuras', true);
}
function actorUpdate(actor, updates, options) {
    if (options['chris-premades']?.refreshAuras) refreshEffects();
}
function canvasReady() {
    auras = {};
    let sceneTokens = game.canvas.scene.tokens.contents;
    for (let token of sceneTokens) {
        let flagAuras = token.actor.flags['chris-premades']?.aura;
        if (!flagAuras) continue;
        add(flagAuras, token.uuid, false);
    }
    refreshEffects();
}
async function tokenMoved(token, ignoredUuid, ignoredAura) {
    let distaceMap = {};
    for (let auraName of Object.values(auras)) {
        let validSources = [];
        for (let aura of auraName) {
            if (aura.tokenUuid === ignoredUuid && (ignoredAura === aura.name || ignoredAura === 'all')) continue;
            let sourceToken = await fromUuid(aura.tokenUuid);
            let distance = distaceMap[sourceToken.id];
            if (!distance) {
                distance = chris.getDistance(token, sourceToken);
                distaceMap[sourceToken.id] = distance;
            }
            if (distance > aura.range) continue;
            if (aura.conscious) {
                let sourceHP = sourceToken.actor.system.attributes.hp.value;
                if (sourceHP === 0) continue;
            }
            switch (aura.disposition) {
                case 'ally':
                    if (token.disposition != sourceToken.disposition) continue;
                    break;
                case 'enemy':
                    if (token.disposition === sourceToken.disposition) continue;
                    break;
            }
            switch (aura.castLevel) {
                case 'cha':
                case 'con':
                case 'dex':
                case 'int':
                case 'str':
                case 'wis':
                    aura.castLevel = sourceToken.actor.system.abilities[aura.castLevel].mod;
                    break;
                case 'castLevel':
                    let auraEffect = chris.findEffect(sourceToken.actor, aura.effectName + ' - Aura');
                    if (!auraEffect) continue;
                    aura.castLevel = chris.getEffectCastLevel(auraEffect);
                    if (!aura.castLevel) continue;
                    break;
            }
            validSources.push(aura);
        }
        let maxLevel = Math.max(...validSources.map(aura => aura.castLevel));
        let selectedAura = validSources.find(aura => aura.castLevel === maxLevel);
        if (selectedAura) {
            console.log('Chris | Adding aura effect ' + selectedAura.effectName + ' to: ' + token.actor.name);
            if (selectedAura.macroName) {
                macros.onMoveEffect(selectedAura.macroName, token, selectedAura);
            }
        } else {
            let effect = chris.findEffect(token.actor, auraName[0].effectName);
            if (effect) {
                console.log('Chris | Removing aura effect ' + auraName[0].effectName + ' from: ' + token.actor.name);
                chris.removeEffect(effect);
            }
        }
        await warpgate.wait(100);
    }
}
async function refreshEffects(ignoredUuid, ignoredAura) {
    for (let token of game.canvas.scene.tokens.contents) {
        tokenMoved(token, ignoredUuid, ignoredAura);
    }
}
function updateToken(token, changes) {
    if (game.settings.get('chris-premades', 'LastGM') != game.user.id) return;
    if (!changes.x && !changes.y && !changes.elevation) return;
    if (token.actor.flags['chris-premades']?.aura) {
        refreshEffects();
    } else {
        tokenMoved(token);
    }
}
function createToken(token, options, id) {
    if (game.settings.get('chris-premades', 'LastGM') != game.user.id) return;
    let aura = token.actor.flags['chris-premades']?.aura;
    if (aura) {
        add(aura, token.uuid, true);
    } else {
        tokenMoved(token);
    }
}
function deleteToken(token, options, id) {
    if (game.settings.get('chris-premades', 'LastGM') != game.user.id) return;
    let aura = token.actor.flags['chris-premades']?.aura;
    if (aura) {
        if (aura.name && aura.tokenUuid) remove(aura.name, aura.tokenUuid);
        refreshEffects(token.uuid, 'all');
    }
    // delete effects on actor?
}
export let effectAuraHooks = {
    'preActorUpdate': preActorUpdate,
    'actorUpdate': actorUpdate,
    'canvasReady': canvasReady,
    'updateToken': updateToken,
    'createToken': createToken,
    'deleteToken': deleteToken
}
export let effectSockets = {
    'remoteAdd': remoteAdd,
    'remoteRemove': remoteRemove
}