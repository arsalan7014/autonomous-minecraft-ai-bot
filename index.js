const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const Movements = require('mineflayer-pathfinder').Movements;
const { GoalNear } = require('mineflayer-pathfinder').goals;
const fs = require('fs');

class AutonomousMinecraftAI {
    constructor(username, serverConfig) {
        this.username = username;
        this.config = serverConfig;
        this.bot = null;
        
        // AI State
        this.isExecuting = false;
        this.currentAction = null;
        this.actionStartTime = null;
        
        // Learning & Performance
        this.skills = new Map();
        this.actionHistory = [];
        this.successCount = 0;
        this.totalActions = 0;
        
        // Environmental Memory
        this.exploredAreas = new Set();
        this.lastPosition = null;
        
        this.start();
    }
    
    start() {
        this.createBot();
    }
    
    createBot() {
        this.bot = mineflayer.createBot({
            host: this.config.host,
            port: this.config.port,
            username: this.username,
            auth: 'offline',
            version: '1.20.2'
        });
        
        this.setupBot();
    }
    
    setupBot() {
        this.bot.loadPlugin(pathfinder);
        
        this.bot.once('spawn', () => {
            const movements = new Movements(this.bot);
            movements.canDig = true;
            movements.maxDropDown = 4;
            this.bot.pathfinder.setMovements(movements);
            
            console.log(`🤖 ${this.username} - Autonomous AI activated!`);
            this.bot.chat(`Hello! I'm ${this.username}, an autonomous AI that learns and adapts!`);
            
            setTimeout(() => this.startAI(), 3000);
        });
        
        this.bot.on('error', (err) => console.log(`❌ Error: ${err.message}`));
        this.bot.on('end', () => setTimeout(() => this.createBot(), 5000));
        this.bot.on('chat', (user, msg) => this.handleChat(user, msg));
    }
    
    // 🧠 Main AI Loop - Makes autonomous decisions and executes them
    async startAI() {
        const aiLoop = async () => {
            if (this.isExecuting) return;
            
            try {
                // Analyze environment
                const situation = this.analyzeSituation();
                
                // Make intelligent decision
                const decision = this.makeDecision(situation);
                
                // Execute with verification
                await this.executeAction(decision, situation);
                
            } catch (error) {
                console.log(`⚠️ AI Error: ${error.message}`);
            }
        };
        
        setInterval(aiLoop, 10000); // Think every 10 seconds
        aiLoop();
    }
    
    // 👁️ Environmental Analysis - Full situational awareness
    analyzeSituation() {
        if (!this.bot.entity) return null;
        
        return {
            health: this.bot.health,
            food: this.bot.food,
            isDay: this.bot.time.timeOfDay < 12000,
            position: this.bot.entity.position,
            
            inventory: {
                wood: this.countItems(['oak_log', 'birch_log', 'spruce_log', 'oak_planks']),
                tools: this.countItems(['wooden_pickaxe', 'stone_pickaxe', 'wooden_axe']),
                food: this.countItems(['beef', 'porkchop', 'chicken', 'bread', 'cooked_beef']),
                stone: this.countItems(['stone', 'cobblestone'])
            },
            
            nearby: {
                wood: this.findNearestResource(['oak_log', 'birch_log', 'spruce_log'], 20),
                stone: this.findNearestResource(['stone', 'cobblestone'], 20),
                animals: this.findNearestEntity(['cow', 'pig', 'chicken', 'sheep'], 15),
                threats: this.findNearestEntity(['zombie', 'skeleton', 'creeper'], 15)
            }
        };
    }
    
    // 🎯 Intelligent Decision Making - Prioritizes survival and progression
    makeDecision(situation) {
        // Emergency priorities
        if (situation.health < 8) {
            return { action: 'seek_safety', reason: `Critical health: ${situation.health}/20` };
        }
        
        if (situation.food < 6 && situation.nearby.animals) {
            return { 
                action: 'hunt_animal', 
                reason: `Hungry (${situation.food}/20) - ${situation.nearby.animals.name} nearby`,
                target: situation.nearby.animals
            };
        }
        
        if (situation.nearby.threats) {
            return { 
                action: 'flee_danger', 
                reason: `${situation.nearby.threats.name} at ${situation.nearby.threats.distance}m`,
                target: situation.nearby.threats
            };
        }
        
        // Progression priorities  
        if (situation.inventory.wood < 8 && situation.nearby.wood) {
            return { 
                action: 'collect_wood', 
                reason: `Need wood (${situation.inventory.wood}) - ${situation.nearby.wood.type} available`,
                target: situation.nearby.wood
            };
        }
        
        if (situation.inventory.wood >= 4 && situation.inventory.tools === 0) {
            return { action: 'craft_tools', reason: `Have ${situation.inventory.wood} wood - making tools` };
        }
        
        if (situation.inventory.tools > 0 && situation.nearby.stone) {
            return { 
                action: 'mine_stone', 
                reason: `Have tools - mining ${situation.nearby.stone.type}`,
                target: situation.nearby.stone
            };
        }
        
        // Default exploration
        return { action: 'explore', reason: 'Looking for opportunities' };
    }
    
    // ⚡ Action Execution - Actually completes tasks with verification
    async executeAction(decision, situation) {
        this.isExecuting = true;
        this.currentAction = decision.action;
        this.actionStartTime = Date.now();
        
        console.log(`🚀 ${this.username}: ${decision.action} - ${decision.reason}`);
        this.bot.chat(`🎯 ${decision.action}`);
        
        let success = false;
        let details = '';
        
        try {
            switch (decision.action) {
                case 'collect_wood':
                    ({ success, details } = await this.collectWood(decision.target));
                    break;
                case 'craft_tools':
                    ({ success, details } = await this.craftTools());
                    break;
                case 'hunt_animal':
                    ({ success, details } = await this.huntAnimal(decision.target));
                    break;
                case 'mine_stone':
                    ({ success, details } = await this.mineStone(decision.target));
                    break;
                case 'seek_safety':
                    ({ success, details } = await this.seekSafety());
                    break;
                case 'flee_danger':
                    ({ success, details } = await this.fleeDanger(decision.target));
                    break;
                default:
                    ({ success, details } = await this.explore());
            }
            
            // Record performance
            const executionTime = Date.now() - this.actionStartTime;
            this.recordResult(decision.action, success, executionTime, details);
            
            // Learn from experience
            this.learnFromAction(decision.action, situation, success);
            
            if (success) {
                console.log(`✅ Success: ${details}`);
                this.bot.chat(`✅ ${details}`);
            } else {
                console.log(`❌ Failed: ${details}`);
                this.bot.chat(`❌ ${details}`);
            }
            
        } catch (error) {
            console.log(`💥 Execution error: ${error.message}`);
        } finally {
            this.isExecuting = false;
            this.currentAction = null;
        }
    }
    
    // 🌳 Collect Wood - Moves to tree and actually harvests it
    async collectWood(target) {
        const woodBefore = this.countItems(['oak_log', 'birch_log', 'spruce_log']);
        
        // Move to tree
        const goal = new GoalNear(target.position.x, target.position.y, target.position.z, 1);
        this.bot.pathfinder.setGoal(goal);
        
        const moved = await this.waitForMovement(12000);
        if (!moved) return { success: false, details: 'Could not reach tree' };
        
        // Harvest
        try {
            const block = this.bot.blockAt(target.position);
            if (block && block.name.includes('log')) {
                await this.bot.dig(block);
                await this.sleep(2000); // Wait for collection
                
                const woodAfter = this.countItems(['oak_log', 'birch_log', 'spruce_log']);
                const gained = woodAfter - woodBefore;
                
                if (gained > 0) {
                    return { success: true, details: `Collected ${gained} wood` };
                }
            }
        } catch (error) {
            return { success: false, details: `Mining failed: ${error.message}` };
        }
        
        return { success: false, details: 'No wood collected' };
    }
    
    // 🔨 Craft Tools - Creates pickaxe and axe from wood
    async craftTools() {
        try {
            const wood = this.bot.inventory.findInventoryItem('oak_log') || 
                        this.bot.inventory.findInventoryItem('birch_log') ||
                        this.bot.inventory.findInventoryItem('spruce_log');
            
            if (!wood || wood.count < 3) {
                return { success: false, details: 'Insufficient wood' };
            }
            
            // Craft sequence
            const plankType = wood.name.replace('_log', '_planks');
            await this.bot.craft(this.bot.registry.itemsByName[plankType], 4);
            await this.bot.craft(this.bot.registry.itemsByName.stick, 4);
            await this.bot.craft(this.bot.registry.itemsByName.wooden_pickaxe, 1);
            
            return { success: true, details: 'Crafted tools successfully' };
            
        } catch (error) {
            return { success: false, details: `Crafting failed: ${error.message}` };
        }
    }
    
    // 🍖 Hunt Animal - Approaches and attacks for food
    async huntAnimal(target) {
        const goal = new GoalNear(target.position.x, target.position.y, target.position.z, 2);
        this.bot.pathfinder.setGoal(goal);
        
        const moved = await this.waitForMovement(8000);
        if (!moved) return { success: false, details: 'Could not reach animal' };
        
        try {
            // Look for the animal (might have moved)
            const animals = Object.values(this.bot.entities).filter(e => 
                e.name === target.name && e.position && 
                this.bot.entity.position.distanceTo(e.position) <= 5
            );
            
            if (animals.length > 0) {
                this.bot.attack(animals[0]);
                return { success: true, details: `Hunted ${target.name}` };
            }
        } catch (error) {
            return { success: false, details: `Hunt failed: ${error.message}` };
        }
        
        return { success: false, details: 'Animal escaped' };
    }
    
    // ⛏️ Mine Stone - Digs stone blocks for tools
    async mineStone(target) {
        const stoneBefore = this.countItems(['stone', 'cobblestone']);
        
        const goal = new GoalNear(target.position.x, target.position.y, target.position.z, 1);
        this.bot.pathfinder.setGoal(goal);
        
        const moved = await this.waitForMovement(12000);
        if (!moved) return { success: false, details: 'Could not reach stone' };
        
        try {
            const block = this.bot.blockAt(target.position);
            if (block && (block.name === 'stone' || block.name === 'cobblestone')) {
                await this.bot.dig(block);
                await this.sleep(2000);
                
                const stoneAfter = this.countItems(['stone', 'cobblestone']);
                const gained = stoneAfter - stoneBefore;
                
                if (gained > 0) {
                    return { success: true, details: `Mined ${gained} stone` };
                }
            }
        } catch (error) {
            return { success: false, details: `Mining failed: ${error.message}` };
        }
        
        return { success: false, details: 'No stone mined' };
    }
    
    // 🛡️ Seek Safety - Moves to safer location
    async seekSafety() {
        const pos = this.bot.entity.position;
        const safeX = pos.x + (Math.random() * 20 - 10);
        const safeZ = pos.z + (Math.random() * 20 - 10);
        const safeY = pos.y + 2;
        
        const goal = new GoalNear(safeX, safeY, safeZ, 3);
        this.bot.pathfinder.setGoal(goal);
        
        const moved = await this.waitForMovement(10000);
        return { success: moved, details: moved ? 'Reached safety' : 'Could not find safety' };
    }
    
    // 🏃 Flee Danger - Escapes from threats
    async fleeDanger(threat) {
        const myPos = this.bot.entity.position;
        const escapeX = myPos.x + (myPos.x - threat.position.x);
        const escapeZ = myPos.z + (myPos.z - threat.position.z);
        
        const goal = new GoalNear(escapeX, myPos.y, escapeZ, 3);
        this.bot.pathfinder.setGoal(goal);
        
        const moved = await this.waitForMovement(6000);
        return { success: moved, details: moved ? `Fled from ${threat.name}` : 'Could not escape' };
    }
    
    // 🚶 Explore - Discovers new areas
    async explore() {
        const pos = this.bot.entity.position;
        const exploreX = pos.x + (Math.random() * 40 - 20);
        const exploreZ = pos.z + (Math.random() * 40 - 20);
        
        const goal = new GoalNear(exploreX, pos.y, exploreZ, 5);
        this.bot.pathfinder.setGoal(goal);
        
        const moved = await this.waitForMovement(15000);
        
        if (moved) {
            this.exploredAreas.add(`${Math.floor(pos.x/10)},${Math.floor(pos.z/10)}`);
        }
        
        return { success: moved, details: moved ? 'Explored new area' : 'Exploration incomplete' };
    }
    
    // 🚶 Movement Helper - Waits for pathfinding completion
    async waitForMovement(timeout) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.bot.pathfinder.setGoal(null);
                resolve(false);
            }, timeout);
            
            this.bot.once('goal_reached', () => {
                clearTimeout(timer);
                resolve(true);
            });
        });
    }
    
    // 🧠 Learning System - Improves from experience
    learnFromAction(action, situation, success) {
        const contextKey = `${action}_${situation.inventory.wood}_${situation.inventory.tools}`;
        
        if (!this.skills.has(contextKey)) {
            this.skills.set(contextKey, { attempts: 0, successes: 0 });
        }
        
        const skill = this.skills.get(contextKey);
        skill.attempts++;
        if (success) skill.successes++;
        
        // Save skills periodically
        if (this.totalActions % 10 === 0) {
            this.saveSkills();
        }
    }
    
    // 💾 Skill Persistence
    saveSkills() {
        const skillData = Object.fromEntries(this.skills);
        fs.writeFileSync(`${this.username}_skills.json`, JSON.stringify(skillData, null, 2));
    }
    
    loadSkills() {
        try {
            const data = fs.readFileSync(`${this.username}_skills.json`, 'utf8');
            const skillData = JSON.parse(data);
            this.skills = new Map(Object.entries(skillData));
            console.log(`📚 Loaded ${this.skills.size} learned skills`);
        } catch (error) {
            console.log('🆕 Starting with fresh skills');
        }
    }
    
    // 📊 Performance Tracking
    recordResult(action, success, time, details) {
        this.totalActions++;
        if (success) this.successCount++;
        
        this.actionHistory.push({ action, success, time, details, timestamp: Date.now() });
        
        if (this.actionHistory.length > 20) {
            this.actionHistory.shift();
        }
        
        const successRate = ((this.successCount / this.totalActions) * 100).toFixed(1);
        console.log(`📈 Performance: ${successRate}% success rate (${this.successCount}/${this.totalActions})`);
    }
    
    // 🔍 Utility Functions
    findNearestResource(blockTypes, radius) {
        let nearest = null;
        let nearestDistance = radius;
        const pos = this.bot.entity.position;
        
        for (let x = -radius; x <= radius; x += 2) {
            for (let z = -radius; z <= radius; z += 2) {
                for (let y = -2; y <= 2; y++) {
                    try {
                        const checkPos = pos.offset(x, y, z);
                        const block = this.bot.blockAt(checkPos);
                        
                        if (block && blockTypes.includes(block.name)) {
                            const distance = Math.sqrt(x*x + y*y + z*z);
                            if (distance < nearestDistance) {
                                nearest = { position: checkPos, distance, type: block.name };
                                nearestDistance = distance;
                            }
                        }
                    } catch (e) {}
                }
            }
        }
        
        return nearest;
    }
    
    findNearestEntity(entityTypes, radius) {
        const entities = Object.values(this.bot.entities);
        let nearest = null;
        let nearestDistance = radius;
        
        for (const entity of entities) {
            if (entity.name && entity.position && entityTypes.includes(entity.name)) {
                const distance = this.bot.entity.position.distanceTo(entity.position);
                if (distance < nearestDistance) {
                    nearest = { entity, position: entity.position, distance, name: entity.name };
                    nearestDistance = distance;
                }
            }
        }
        
        return nearest;
    }
    
    countItems(itemNames) {
        let total = 0;
        for (const slot of this.bot.inventory.slots) {
            if (slot && itemNames.includes(slot.name)) {
                total += slot.count;
            }
        }
        return total;
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    handleChat(username, message) {
        if (username === this.bot.username) return;
        
        if (message.includes(this.username) || message.includes('?')) {
            const successRate = ((this.successCount / this.totalActions) * 100).toFixed(1);
            this.bot.chat(`Hello ${username}! Success rate: ${successRate}% (${this.successCount}/${this.totalActions} actions). Currently: ${this.currentAction || 'thinking'}`);
        }
    }
}

// 🚀 Usage Example
if (require.main === module) {
    const config = require('./config.json');
    const bot = new AutonomousMinecraftAI('AutonomousAI', config);
}

module.exports = AutonomousMinecraftAI;
