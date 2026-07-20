const  board = document.querySelector('.board');
const startButton = document.querySelector(".btn-start");
const modal = document.querySelector(".modal");
const startGameModal = document.querySelector(".start-game");
const gameOverModal = document.querySelector(".game-over");
const  restartButton = document.querySelector(".btn-restart");

const highScoreElement = document.querySelector("#high-score");
const scoreElement = document.querySelector("#score");
const timeElement = document.querySelector("#time");

const blocksize = 50;

let highScore = localStorage.getItem("highScore");
let score = 0;
let time = `00-00`;

const cols = Math.floor(board.clientWidth/blocksize);
const rows = Math.floor(board.clientHeight/blocksize);

let intervalId = null;
let timerIntervalId = null;



let food = {x:Math.floor(Math.random() * rows), y:Math.floor(Math.random() * cols)};
// console.log(col);

const blocks = [];

let  snake = [{
        x:1,y:3
    }
    // ,{
    //     x:1,y:4
    // },{
    //     x:1,y:5
    // }
];

let direction = "down";

for (let i=0;i<rows;i++){
    for (let j=0;j<cols;j++){
        const block = document.createElement('div');
        block.classList.add("block");
        board.appendChild(block);
        // block.innerText = `${i}-${j}`;
        blocks[`${i}-${j}`] = block;
    }
}

function render(){

    let head = null;

    blocks[`${food.x}-${food.y}`].classList.add("food");

    if (direction=="left"){
        head =  {x:snake[0].x,y:snake[0].y-1};
    }
    else if (direction=="right"){
        head =  {x:snake[0].x,y:snake[0].y+1};
    }
    else if (direction=="top"){
        head =  {x:snake[0].x-1,y:snake[0].y};
    }
    else if (direction=="down"){
        head =  {x:snake[0].x+1,y:snake[0].y};
    }

    // wall collision
    if (head.x<0 || head.x>=rows || head.y<0 || head.y>=cols){
        alert("Game Over");
        clearInterval(intervalId);
        clearInterval(timerIntervalId);

        modal.style.display = "flex";
        startGameModal.style.display = "none";
        gameOverModal.style.display = "flex";
        return;
    }

    // self collision
    for (let i=0;i<snake.length;i++){
        if (head.x === snake[i].x && head.y === snake[i].y){
            alert("Game Over");
            clearInterval(intervalId);
            clearInterval(timerIntervalId);

            modal.style.display = "flex";
            startGameModal.style.display = "none";
            gameOverModal.style.display = "flex";
            return;

        }
    }

    // food consume logic
    if (head.x==food.x && head.y==food.y){
        blocks[`${food.x}-${food.y}`].classList.remove("food");
        food = {x:Math.floor(Math.random() * rows), y:Math.floor(Math.random() * cols)};
        blocks[`${food.x}-${food.y}`].classList.add("food");

        snake.unshift(head);

        score += 10;
        scoreElement.innerText = score;

        if (score > highScore){
            highScore =  score;
            // highScoreElement.innerText = highScore; 
            localStorage.setItem("highScore",highScore.toString());
        }
    }

    snake.forEach(head =>{
        blocks[`${head.x}-${head.y}`].classList.remove("fill");
    });
    snake.unshift(head);
    snake.pop();

    snake.forEach(segment =>{
        blocks[`${segment.x}-${segment.y}`].classList.add("fill");
    });
}

// intervalId = setInterval(()=>{
//     render();
// },200);

startButton.addEventListener("click", ()=>{
    modal.style.display = "none";
    intervalId = setInterval(()=>{
        render();
    },300);
    timerIntervalId = setInterval(()=>{
        let [min,sec] = time.split("-").map(Number);

        if (sec==59){
            min+=1;
            sec = 0;
        }
        else{
            sec+=1;
        }

        time = `${min}-${sec}`;
        timeElement.innerText = time;   
    },1000);

});


restartButton.addEventListener("click", restartGame);
function  restartGame(){
    clearInterval(intervalId);
    clearInterval(timerIntervalId); 
    blocks[`${food.x}-${food.y}`].classList.remove("food");

    snake.forEach((head)=>{
        blocks[`${head.x}-${head.y}`].classList.remove("fill");
    });

    score = 0;
    time = `00-00`;

    scoreElement.innerText = score;
    timeElement.innerText = time;
    highScoreElement.innerText = highScore;

    modal.style.display = "none";
    direction = "down";
    snake = [{x:1,y:3}];
    food = {x:Math.floor(Math.random() * rows), y:Math.floor(Math.random() * cols)};
    intervalId = setInterval(()=>{
        render();
    },200);
}



addEventListener("keydown", (event)=>{
    if (event.key === "ArrowUp"){
        direction = "top";
    }
    if (event.key === "ArrowDown"){
        direction = "down";
    }
    if (event.key === "ArrowLeft"){
        direction = "left";
    }
    if (event.key === "ArrowRight"){
        direction = "right";
    }
});