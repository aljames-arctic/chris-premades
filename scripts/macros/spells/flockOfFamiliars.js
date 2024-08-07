import {Summons} from '../../lib/summons.js';
import {actorUtils, compendiumUtils, constants, dialogUtils, effectUtils, errors, genericUtils, itemUtils, tokenUtils} from '../../utils.js';

async function use({workflow}) {
    let concentrationEffect = effectUtils.getConcentrationEffect(workflow.actor, workflow.item);
    let spellLevel = workflow.castData?.castLevel;
    if (!spellLevel) {
        if (concentrationEffect) await genericUtils.remove(concentrationEffect);
        return;
    }
    let findFamiliarEffect = effectUtils.getEffectByIdentifier(workflow.actor, 'findFamiliar');
    let totalSummons = findFamiliarEffect ? spellLevel : spellLevel + 1;
    let attackData = await compendiumUtils.getItemFromCompendium(constants.featurePacks.spellFeatures, 'Flock of Familiars: Attack', {object: true, getDescription: true, translate: 'CHRISPREMADES.Macros.FlockOfFamiliars.Attack', identifier: 'flockOfFamiliarsAttack'});
    if (!attackData) {
        errors.missingPackItem();
        if (concentrationEffect) await genericUtils.remove(concentrationEffect);
        return;
    }
    effectUtils.addMacro(attackData, 'midi.item', ['flockOfFamiliarsAttack']);
    let itemsToAdd = [attackData];
    let folder = itemUtils.getConfig(workflow.item, 'folder');
    if (!folder?.length) folder = 'Familiars';
    let actors = game.actors.filter(i => i.folder?.name === folder);
    if (!actors.length) {
        genericUtils.notify(genericUtils.format('CHRISPREMADES.Error.NoActors', {folder}), 'warn', {localize: false});
        return;
    }
    let sourceActors = await dialogUtils.selectDocumentsDialog(workflow.item.name, genericUtils.format('CHRISPREMADES.Summons.SelectSummons', {totalSummons}), actors, {
        max: totalSummons
    });
    if (!sourceActors?.length || !sourceActors.reduce((acc, x) => acc += x.amount, 0)) return;
    sourceActors = sourceActors.reduce((acc, i) => acc.concat(Array(i.amount).fill(i.document)), []);
    let creatureType;
    if (findFamiliarEffect) {
        let pocketDimensionEffect = effectUtils.getEffectByIdentifier(workflow.actor, 'findFamiliarPocketDimension');
        creatureType = pocketDimensionEffect?.flags['chris-premades'].findFamiliarPocketDimension.updates.actor.system.details.type.value;
    }
    if (!creatureType) {
        let creatureButtons = [
            ['DND5E.CreatureCelestial', 'celestial'],
            ['DND5E.CreatureFey', 'fey'],
            ['DND5E.CreatureFiend', 'fiend']
        ];
        creatureType = await dialogUtils.buttonDialog(workflow.item.name, 'CHRISPREMADES.Macros.FindSteed.Type', creatureButtons);
    }
    if (!creatureType) return;
    let updates = [];
    for (let i of sourceActors) {
        let name = genericUtils.format('CHRISPREMADES.Summons.FamiliarDefault', {option: i.name});
        updates.push({
            actor: {
                name,
                system: {
                    details: {
                        type: {
                            value: creatureType
                        }
                    }
                },
                prototypeToken: {
                    name
                }
            },
            token: {
                name,
                disposition: workflow.token.document.disposition
            }
        });
    }
    let investmentOfTheChainMaster = itemUtils.getItemByIdentifier(workflow.actor, 'investmentOfTheChainMaster');
    if (investmentOfTheChainMaster) {
        let movementButtons = [
            ['DND5E.MovementFly', 'fly'],
            ['DND5E.MovementSwim', 'swim']
        ];
        let movement = await dialogUtils.buttonDialog(investmentOfTheChainMaster.name, 'CHRISPREMADES.Macros.FindFamiliar.Movement', movementButtons);
        let itemUpdates = [];
        let saveDC = itemUtils.getSaveDC(workflow.item);
        for (let sourceActor of sourceActors) {
            let weaponItems = sourceActor.items.filter(i => i.type === 'weapon');
            let saveItems = sourceActor.items.filter(i => !!i.system.save.dc);
            let currItemUpdates = [];
            for (let i of weaponItems) {
                let properties = Array.from(i.system.properties);
                properties.push('mgc');
                currItemUpdates.push({_id: i.id, system: {properties}});
            }
            for (let i of saveItems) {
                let currItem = currItemUpdates.find(j => j._id === i.id);
                if (currItem) {
                    currItem.system.save = {dc: saveDC};
                } else {
                    currItemUpdates.push({_id: i.id, system: {save: {dc: saveDC}}});
                }
            }
            itemUpdates.push(currItemUpdates);
        }
        let resistanceData = await compendiumUtils.getItemFromCompendium(constants.featurePacks.summonFeatures, 'Investment of the Chain Master: Familiar Resistance', {object: true, getDescription: true, translate: 'CHRISPREMADES.Macros.InvestmentOfTheChainMaster.Resistance', identifier: 'investmentOfTheChainMasterResistance'});
        if (!resistanceData) {
            errors.missingPackItem();
            return;
        }
        effectUtils.addMacro(resistanceData, 'midi.item', ['investmentOfTheChainMasterActive']);
        for (let i = 0; i < updates.length; i++) {
            itemUpdates[i].push(resistanceData);
            genericUtils.setProperty(updates[i], 'actor.items', itemUpdates[i]);
            genericUtils.setProperty(updates[i], 'actor.system.attributes.movement.' + movement, 40);
        }
        if (!findFamiliarEffect) {
            let commandData = await compendiumUtils.getItemFromCompendium(constants.packs.classFeatureItems, 'Investment of the Chain Master: Command', {object: true, getDescription: true, translate: 'CHRISPREMADES.Macros.InvestmentOfTheChainMaster.Command', identifier: 'investmentOfTheChainMasterCommand'});
            if (!commandData) {
                errors.missingPackItem();
                return;
            }
            itemsToAdd.push(commandData);
        }
    }
    let animation = itemUtils.getConfig(workflow.item, creatureType + 'Animation') ?? 'none';
    await Summons.spawn(sourceActors, updates, workflow.item, workflow.token, {
        duration: 864000, 
        range: 10, 
        animation,
        additionalVaeButtons: itemsToAdd.map(i => {return {type: 'use', name: i.name, identifier: i.flags['chris-premades'].info.identifier};})
    });
    let casterEffect = effectUtils.getEffectByIdentifier(workflow.actor, 'flockOfFamiliars');
    if (!casterEffect) {
        if (concentrationEffect) await genericUtils.remove(concentrationEffect);
        return;
    }
    if (investmentOfTheChainMaster && !findFamiliarEffect) {
        await genericUtils.update(casterEffect, {'flags.chris-premades.macros.combat': ['investmentOfTheChainMasterActive']});
    }
    await itemUtils.createItems(workflow.actor, itemsToAdd, {favorite: true, section: genericUtils.translate('CHRISPREMADES.Section.SpellFeatures'), parentEntity: casterEffect});
}
async function late({workflow}) {
    let effect = effectUtils.getEffectByIdentifier(workflow.actor, 'flockOfFamiliars');
    if (!effect) return;
    let familiarTokens = new Set(effect.flags['chris-premades'].summons.ids[effect.name].map(i => canvas.scene.tokens.get(i)));
    if (!familiarTokens?.size) return;
    for (let i of familiarTokens) {
        if (tokenUtils.getDistance(workflow.token, i) > 100) familiarTokens.delete(i);
    }
    if (!familiarTokens.size) {
        genericUtils.notify('CHRISPREMADES.Macros.FlockOfFamilias.TooFar', 'info');
        return;
    }
    for (let i of familiarTokens) {
        if (actorUtils.hasUsedReaction(i.actor)) familiarTokens.delete(i);
    }
    if (!familiarTokens.size) {
        genericUtils.notify('CHRISPREMADES.Macros.FlockOfFamiliars.ReactionUsed', 'info');
        return;
    }
    let effectData = {
        name: workflow.item.name,
        img: workflow.item.img,
        origin: workflow.item.uuid,
        duration: {
            seconds: 1
        },
        changes: [
            {
                key: 'flags.midi-qol.rangeOverride.attack.all',
                mode: 0,
                value: 1,
                priority: 20
            }
        ],
        flags: {
            dae: {
                specialDuration: [
                    '1Attack'
                ]
            }
        }
    };
    effectUtils.addMacro(effectData, 'midi.actor', ['flockOfFamiliarsAttack']);
    let casterEffect = await effectUtils.createEffect(workflow.actor, effectData);
    for (let i of familiarTokens) await effectUtils.createEffect(i.actor, effectData, {parentEntity: casterEffect});
}
async function early({workflow}) {
    if (workflow.item.type !== 'spell' || workflow.item.system.range.units !== 'touch') {
        genericUtils.notify('CHRISPREMADES.Macros.FindFamiliar.InvalidSpell', 'info');
        workflow.aborted = true;
        return;
    }
    if (!workflow.targets.size) {
        workflow.aborted = true;
        return;
    }
    let effect = effectUtils.getEffectByIdentifier(workflow.actor, 'flockOfFamiliars');
    if (!effect) return;
    let familiarTokens = new Set(effect.flags['chris-premades'].summons.ids[effect.name].map(i => canvas.scene.tokens.get(i)));
    if (!familiarTokens?.size) return;
    for (let i of familiarTokens) {
        if (tokenUtils.getDistance(workflow.targets.first(), i) > 5) familiarTokens.delete(i);
    }
    if (!familiarTokens.size) return;
    await actorUtils.setReactionUsed(familiarTokens.first().actor);
}
export let flockOfFamiliars = {
    name: 'Flock of Familiars',
    version: '0.12.9',
    midi: {
        item: [
            {
                pass: 'rollFinished',
                macro: use,
                priority: 50
            }
        ]
    },
    config: [
        {
            value: 'folder',
            label: 'CHRISPREMADES.Summons.Folder',
            type: 'text',
            default: 'Familiars',
            category: 'summons'
        },
        {
            value: 'celestialAnimation',
            label: 'CHRISPREMADES.Config.SpecificAnimation',
            i18nOption: 'Celestial',
            type: 'select',
            default: 'celestial',
            category: 'animation',
            options: constants.summonAnimationOptions
        },
        {
            value: 'feyAnimation',
            label: 'CHRISPREMADES.Config.SpecificAnimation',
            i18nOption: 'Fey',
            type: 'select',
            default: 'nature',
            category: 'animation',
            options: constants.summonAnimationOptions
        },
        {
            value: 'fiendAnimation',
            label: 'CHRISPREMADES.Config.SpecificAnimation',
            i18nOption: 'Fiend',
            type: 'select',
            default: 'fire',
            category: 'animation',
            options: constants.summonAnimationOptions
        },
    ]
};
export let flockOfFamiliarsAttack = {
    name: 'Flock of Familiars: Attack',
    version: flockOfFamiliars.version,
    midi: {
        item: [
            {
                pass: 'rollFinished',
                macro: late,
                priority: 50
            }
        ],
        actor: [
            {
                pass: 'preambleComplete',
                macro: early,
                priority: 50
            }
        ]
    }
};