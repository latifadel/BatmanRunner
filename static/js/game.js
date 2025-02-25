class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();

        // Skin configuration
        this.skins = {
            modern: {
                image: new Image(),
                path: '/static/assets/batcar.svg',
                name: 'Modern Batmobile',
                effects: {
                    glowColor: '#0ff',
                    particleColor: '#4CAF50',
                    engineParticles: true,
                    trailEffect: true,
                    boostEffect: {
                        color: '#0ff',
                        size: 2,
                        count: 15
                    }
                }
            },
            classic: {
                image: new Image(),
                path: '/static/assets/batcar-classic.svg',
                name: 'Classic Batmobile',
                effects: {
                    glowColor: '#f00',
                    particleColor: '#ff5252',
                    engineParticles: true,
                    trailEffect: true,
                    boostEffect: {
                        color: '#f00',
                        size: 3,
                        count: 10
                    }
                }
            }
        };

        // Load all skin images
        Object.values(this.skins).forEach(skin => {
            skin.image.src = skin.path;
        });

        // Current skin
        this.currentSkin = 'modern';
        this.skinTransition = 0;
        this.oldSkin = null;

        // Load other assets
        this.enemyImage = new Image();
        this.cityBgImage = new Image();
        this.coinImage = new Image();

        this.enemyImage.src = '/static/assets/enemy.svg';
        this.cityBgImage.src = '/static/assets/city-bg.svg';
        this.coinImage.src = '/static/assets/coin.svg';

        // Game state
        this.isRunning = false;
        this.score = 0;
        this.multiplier = 1;
        this.speed = 5;
        this.bgOffset = 0;
        this.lastTouchX = 0;
        this.coins = [];
        this.speedBoost = 0;
        this.boostParticles = []; // Added boostParticles array

        // Player properties
        this.player = {
            x: this.canvas.width / 2,
            y: this.canvas.height - 100,
            width: 80,
            height: 40,
            lane: 1,
            isJumping: false,
            jumpHeight: 0,
            rotation: 0,
            engineGlow: 0,
            speedLines: [],
            boostParticles: []
        };

        // Game properties
        this.lanes = [
            this.canvas.width / 4,
            this.canvas.width / 2,
            (this.canvas.width / 4) * 3
        ];
        this.obstacles = [];
        this.particles = [];
        this.speedLines = [];
        this.lastObstacleTime = 0;
        this.lastCoinTime = 0;

        // Touch controls setup
        this.setupTouchControls();

        // UI elements
        this.setupUI();

        // Register service worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/service-worker.js')
                .then(registration => console.log('ServiceWorker registration successful'))
                .catch(err => console.log('ServiceWorker registration failed:', err));
        }
    }

    setupTouchControls() {
        let touchStartX = 0;
        let touchStartY = 0;

        this.canvas.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            e.preventDefault();
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;

            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;

            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                if (deltaX > 50 && this.player.lane < 2) {
                    this.moveRight();
                } else if (deltaX < -50 && this.player.lane > 0) {
                    this.moveLeft();
                }
            } else if (deltaY < -50) {
                this.jump();
            }

            e.preventDefault();
        }, { passive: false });
    }

    setupUI() {
        this.startScreen = document.getElementById('start-screen');
        this.gameOverScreen = document.getElementById('game-over');
        this.scoreElement = document.getElementById('score');
        this.finalScoreElement = document.getElementById('final-score');
        this.multiplierElement = document.getElementById('multiplier');

        document.getElementById('start-btn').addEventListener('click', () => this.startGame());
        document.getElementById('restart-btn').addEventListener('click', () => this.startGame());

        document.addEventListener('keydown', (e) => this.handleInput(e));
        this.setupSkinSelection();
    }

    setupSkinSelection() {
        const skinSelector = document.getElementById('skin-selector');
        Object.entries(this.skins).forEach(([id, skin]) => {
            const option = document.createElement('div');
            option.className = 'skin-option' + (id === this.currentSkin ? ' selected' : '');
            option.innerHTML = `
                <img src="${skin.path}" alt="${skin.name}" width="80">
                <span>${skin.name}</span>
            `;
            option.onclick = () => this.changeSkin(id);
            skinSelector.appendChild(option);
        });
    }


    createParticle(x, y, color, type = 'normal') {
        const skin = this.skins[this.currentSkin];
        const finalColor = color === '#4CAF50' ? skin.effects.particleColor : color;

        if (type === 'engine' && !skin.effects.engineParticles) {
            return null;
        }

        const particle = {
            x, y,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5,
            life: 1,
            color: finalColor,
            type,
            scale: Math.random() * 0.5 + 0.5,
            rotation: Math.random() * 360
        };

        if (type === 'speed') {
            particle.vx = -5 - Math.random() * 5;
            particle.vy = (Math.random() - 0.5) * 2;
            particle.length = 20 + Math.random() * 20;
        } else if (type === 'trail' && skin.effects.trailEffect) {
            particle.vx = (Math.random() - 0.5) * 2;
            particle.vy = Math.random() * 2;
            particle.life = 0.5;
        } else if (type === 'transition') {
            particle.vx = (Math.random() - 0.5) * 10;
            particle.vy = (Math.random() - 0.5) * 10;
            particle.life = 2;
            particle.scale = Math.random() * 1.5 + 1;
        } else if (type === 'boost') {
            const boost = skin.effects.boostEffect;
            particle.scale = boost.size;
            particle.color = boost.color;
            particle.life = 0.8;
        }

        return particle;
    }

    createSpeedLine() {
        return {
            x: this.canvas.width + 10,
            y: Math.random() * this.canvas.height,
            length: 50 + Math.random() * 100,
            speed: this.speed * (1 + Math.random())
        };
    }

    moveLeft() {
        if (this.player.lane > 0) {
            this.player.lane--;
            this.player.rotation = -15;
            setTimeout(() => this.player.rotation = 0, 200);
            this.createMovementParticles('right');
        }
    }

    moveRight() {
        if (this.player.lane < 2) {
            this.player.lane++;
            this.player.rotation = 15;
            setTimeout(() => this.player.rotation = 0, 200);
            this.createMovementParticles('left');
        }
    }

    jump() {
        if (!this.player.isJumping) {
            this.player.isJumping = true;
            this.player.jumpHeight = 150;
            this.createJumpParticles();
        }
    }

    createMovementParticles(direction) {
        const x = this.player.x + (direction === 'left' ? -20 : 20);
        const y = this.player.y - this.player.jumpHeight;

        for (let i = 0; i < 10; i++) {
            this.particles.push(this.createParticle(x, y, '#4CAF50'));
        }
    }

    createJumpParticles() {
        for (let i = 0; i < 15; i++) {
            this.particles.push(this.createParticle(
                this.player.x,
                this.player.y,
                '#4CAF50'
            ));
        }
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];

            if (particle.type === 'speed') {
                particle.x += particle.vx;
                particle.life -= 0.02;
            } else {
                particle.x += particle.vx;
                particle.y += particle.vy;
                particle.life -= 0.02;
            }

            if (particle.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Update speed lines
        for (let i = this.speedLines.length - 1; i >= 0; i--) {
            const line = this.speedLines[i];
            line.x -= line.speed;
            if (line.x + line.length < 0) {
                this.speedLines.splice(i, 1);
            }
        }

        // Add new speed lines
        if (Math.random() < 0.2) {
            this.speedLines.push(this.createSpeedLine());
        }
    }

    drawParticles() {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.speedLines.forEach(line => {
            this.ctx.beginPath();
            this.ctx.moveTo(line.x, line.y);
            this.ctx.lineTo(line.x + line.length, line.y);
            this.ctx.stroke();
        });

        this.particles.forEach(particle => {
            this.ctx.globalAlpha = particle.life;

            if (particle.type === 'speed') {
                this.ctx.strokeStyle = particle.color;
                this.ctx.beginPath();
                this.ctx.moveTo(particle.x, particle.y);
                this.ctx.lineTo(particle.x + particle.length, particle.y);
                this.ctx.stroke();
            } else {
                this.ctx.save();
                this.ctx.translate(particle.x, particle.y);
                this.ctx.rotate(particle.rotation * Math.PI / 180);
                this.ctx.scale(particle.scale, particle.scale);

                this.ctx.fillStyle = particle.color;
                this.ctx.beginPath();

                if (particle.type === 'trail') {
                    this.ctx.arc(0, 0, 3, 0, Math.PI * 2);
                } else {
                    this.ctx.arc(0, 0, 2, 0, Math.PI * 2);
                }

                this.ctx.fill();
                this.ctx.restore();
            }
        });

        this.ctx.globalAlpha = 1;
    }

    spawnObstacle() {
        const now = Date.now();
        if (now - this.lastObstacleTime > 1000) {
            const lane = Math.floor(Math.random() * 3);
            this.obstacles.push({
                x: this.lanes[lane],
                y: -50,
                width: 40,
                height: 40,
                lane: lane,
                rotation: Math.random() * 360
            });
            this.lastObstacleTime = now;
        }
    }

    spawnCoin() {
        const now = Date.now();
        if (now - this.lastCoinTime > 500) {
            const lane = Math.floor(Math.random() * 3);
            this.coins.push({
                x: this.lanes[lane],
                y: -30,
                width: 20,
                height: 20,
                lane: lane,
                rotation: 0,
                collected: false
            });
            this.lastCoinTime = now;
        }
    }

    updateCoins() {
        for (let i = this.coins.length - 1; i >= 0; i--) {
            const coin = this.coins[i];
            coin.y += this.speed;
            coin.rotation += 5;

            // Check collection
            if (!coin.collected &&
                this.player.lane === coin.lane &&
                Math.abs(this.player.y - coin.y) < 40) {
                coin.collected = true;
                this.score += 50 * this.multiplier;
                this.createCoinCollectionEffect(coin.x, coin.y);
            }

            // Remove coins that are off screen or collected
            if (coin.y > this.canvas.height || coin.collected) {
                this.coins.splice(i, 1);
            }
        }
    }

    createCoinCollectionEffect(x, y) {
        for (let i = 0; i < 10; i++) {
            this.particles.push(this.createParticle(x, y, '#FFD700'));
        }
    }

    updateObstacles() {
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obstacle = this.obstacles[i];
            obstacle.y += this.speed;
            obstacle.rotation += 2;

            if (obstacle.y > this.canvas.height) {
                this.obstacles.splice(i, 1);
                this.score += 10 * this.multiplier;
                this.multiplier = Math.min(this.multiplier + 0.1, 5);
                this.speed = Math.min(this.speed + 0.1, 15);

                for (let j = 0; j < 5; j++) {
                    this.particles.push(this.createParticle(
                        obstacle.x,
                        this.canvas.height,
                        '#ffeb3b'
                    ));
                }
            }

            if (this.checkCollision(obstacle)) {
                for (let j = 0; j < 20; j++) {
                    this.particles.push(this.createParticle(
                        this.player.x,
                        this.player.y - this.player.jumpHeight,
                        '#ff5252'
                    ));
                }
                this.gameOver();
                return;
            }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw scrolling background
        this.bgOffset = (this.bgOffset + this.speed * 0.5) % this.canvas.height;
        this.ctx.drawImage(this.cityBgImage, 0, this.bgOffset - this.canvas.height);
        this.ctx.drawImage(this.cityBgImage, 0, this.bgOffset);

        // Draw lane markers with neon effect
        this.drawLaneMarkers();

        // Draw particles and speed lines
        this.drawParticles();

        // Draw coins
        this.drawCoins();

        // Draw player with effects
        this.drawPlayer();

        // Draw obstacles
        this.drawObstacles();

        // Update score display
        this.updateScoreDisplay();
    }

    drawLaneMarkers() {
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#0ff';
        this.ctx.strokeStyle = '#0ff';
        this.ctx.lineWidth = 2;

        for (let i = 1; i < 3; i++) {
            const x = (this.canvas.width / 3) * i;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        this.ctx.shadowBlur = 0;
    }

    drawCoins() {
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = '#FFD700';

        this.coins.forEach(coin => {
            if (!coin.collected) {
                this.ctx.save();
                this.ctx.translate(coin.x, coin.y);
                this.ctx.rotate(coin.rotation * Math.PI / 180);
                this.ctx.drawImage(
                    this.coinImage,
                    -coin.width / 2,
                    -coin.height / 2,
                    coin.width,
                    coin.height
                );
                this.ctx.restore();
            }
        });

        this.ctx.shadowBlur = 0;
    }

    drawPlayer() {
        const playerY = this.player.y - this.player.jumpHeight - this.player.height / 2;
        const skin = this.skins[this.currentSkin];

        // Skin transition effect
        if (this.skinTransition > 0) {
            this.skinTransition -= 0.05;
            this.ctx.globalAlpha = 1 - this.skinTransition;
            if (this.oldSkin) {
                this.drawRotatedImage(
                    this.skins[this.oldSkin].image,
                    this.player.x - this.player.width / 2,
                    playerY,
                    this.player.width,
                    this.player.height,
                    this.player.rotation
                );
            }
        }

        // Engine glow effect
        this.ctx.shadowBlur = 20;
        this.ctx.shadowColor = skin.effects.glowColor;
        this.ctx.fillStyle = skin.effects.glowColor;
        this.ctx.globalAlpha = (0.5 + Math.sin(this.player.engineGlow) * 0.2) * (1 - this.skinTransition);

        // Enhanced engine glow
        const glowSize = 10 + Math.sin(this.player.engineGlow) * 5;
        this.ctx.beginPath();
        this.ctx.ellipse(
            this.player.x,
            playerY + this.player.height,
            30 + glowSize,
            10 + glowSize / 2,
            0,
            0,
            Math.PI * 2
        );
        this.ctx.fill();

        // Boost effect
        if (this.speedBoost > 0) {
            const boost = skin.effects.boostEffect;
            for (let i = 0; i < boost.count; i++) {
                this.particles.push(this.createParticle(
                    this.player.x + (Math.random() - 0.5) * 40,
                    playerY + this.player.height,
                    boost.color,
                    'boost'
                ));
            }
            this.speedBoost -= 0.1;
        }

        this.ctx.globalAlpha = 1;
        this.ctx.shadowBlur = 0;

        // Draw player
        this.drawRotatedImage(
            skin.image,
            this.player.x - this.player.width / 2,
            playerY,
            this.player.width,
            this.player.height,
            this.player.rotation
        );

        // Reset alpha after transition
        this.ctx.globalAlpha = 1;
    }

    drawObstacles() {
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#f00';
        this.obstacles.forEach(obstacle => {
            this.drawRotatedImage(
                this.enemyImage,
                obstacle.x - obstacle.width / 2,
                obstacle.y - obstacle.height / 2,
                obstacle.width,
                obstacle.height,
                obstacle.rotation
            );
        });
        this.ctx.shadowBlur = 0;
    }

    updateScoreDisplay() {
        this.scoreElement.textContent = Math.floor(this.score);
        this.multiplierElement.textContent = this.multiplier.toFixed(1);
    }

    drawRotatedImage(image, x, y, width, height, rotation) {
        this.ctx.save();
        this.ctx.translate(x + width / 2, y + height / 2);
        this.ctx.rotate(rotation * Math.PI / 180);
        this.ctx.drawImage(image, -width / 2, -height / 2, width, height);
        this.ctx.restore();
    }

    startGame() {
        this.isRunning = true;
        this.score = 0;
        this.multiplier = 1;
        this.obstacles = [];
        this.coins = [];
        this.particles = [];
        this.speedLines = [];
        this.player.lane = 1;
        this.player.isJumping = false;
        this.player.jumpHeight = 0;
        this.speed = 5;
        this.bgOffset = 0;

        this.startScreen.classList.add('d-none');
        this.gameOverScreen.classList.add('d-none');

        this.gameLoop();
    }

    gameOver() {
        this.isRunning = false;
        this.finalScoreElement.textContent = Math.floor(this.score);
        this.gameOverScreen.classList.remove('d-none');
    }

    gameLoop() {
        if (!this.isRunning) return;

        this.spawnObstacle();
        this.spawnCoin();
        this.updateObstacles();
        this.updateCoins();
        this.updateParticles();
        this.updatePlayer();
        this.draw();

        requestAnimationFrame(() => this.gameLoop());
    }

    handleInput(e) {
        if (!this.isRunning) return;

        switch (e.key) {
            case 'ArrowLeft':
                this.moveLeft();
                break;
            case 'ArrowRight':
                this.moveRight();
                break;
            case ' ':
                this.jump();
                break;
        }
    }

    updatePlayer() {
        this.player.x = this.lanes[this.player.lane];
        this.player.engineGlow = (this.player.engineGlow + 0.1) % (Math.PI * 2);

        if (this.player.isJumping) {
            this.player.jumpHeight -= 5;
            if (this.player.jumpHeight <= 0) {
                this.player.isJumping = false;
                this.player.jumpHeight = 0;
            }

            if (Math.random() > 0.7) {
                const particle = this.createParticle(
                    this.player.x,
                    this.player.y,
                    '#4CAF50',
                    'engine'
                );
                if (particle) this.particles.push(particle);
            }
        }

        // Add engine particles
        if (Math.random() > 0.8) {
            const particle = this.createParticle(
                this.player.x + (Math.random() - 0.5) * 40,
                this.player.y - this.player.jumpHeight + Math.random() * 40,
                'rgba(255, 255, 255, 0.5)',
                'speed'
            );
            if (particle) this.particles.push(particle);
        }

        // Add trail effect
        if (Math.random() > 0.7) {
            const particle = this.createParticle(
                this.player.x + (Math.random() - 0.5) * 30,
                this.player.y - this.player.jumpHeight + Math.random() * 30,
                this.skins[this.currentSkin].effects.glowColor,
                'trail'
            );
            if (particle) this.particles.push(particle);
        }
    }

    checkCollision(obstacle) {
        if (this.player.isJumping) return false;

        const collisionThreshold = 30;
        return (
            this.player.lane === obstacle.lane &&
            Math.abs(this.player.y - obstacle.y) < collisionThreshold
        );
    }

    changeSkin(skinId) {
        if (this.skins[skinId] && skinId !== this.currentSkin) {
            this.oldSkin = this.currentSkin;
            this.currentSkin = skinId;
            this.skinTransition = 1;
            this.speedBoost = 1; // Add boost effect on skin change

            // Create transition effect particles
            for (let i = 0; i < 20; i++) {
                this.particles.push(this.createParticle(
                    this.player.x + (Math.random() - 0.5) * 40,
                    this.player.y - this.player.jumpHeight + (Math.random() - 0.5) * 40,
                    this.skins[skinId].effects.glowColor,
                    'transition'
                ));
            }

            // Update UI
            document.querySelectorAll('.skin-option').forEach(option => {
                option.classList.toggle('selected',
                    option.querySelector('span').textContent === this.skins[skinId].name);
                option.classList.add('skin-changing');
                setTimeout(() => option.classList.remove('skin-changing'), 500);
            });
        }
    }

    resizeCanvas() {
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        this.lanes = [
            this.canvas.width / 4,
            this.canvas.width / 2,
            (this.canvas.width / 4) * 3
        ];
    }
}

window.addEventListener('load', () => {
    new Game();
});