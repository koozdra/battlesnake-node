var config  = require('../config.json'),
  express = require('express'),
  router  = express.Router(),
  _ = require('lodash');

var snakeId = 'dc4721f2-82da-4170-b2b4-1792bdf1ba71',
  type = {
    food: 1,
    wall: 2,
    gold: 3,
    me: 4,
    other: 5,
    searched: 6
  },
  // TODO set offsets as attribute of board
  offsets = [[0, 1], [0, -1], [1, 0], [-1, 0]];

function generateBoard(reqData) {
  var board = [];

  board.width = reqData.width;
  board.height = reqData.height;

  _.each(reqData.food, _.partial(setBoardTypeAt, board, type.food));
  _.each(reqData.walls, _.partial(setBoardTypeAt, board, type.wall));
  _.each(reqData.gold, _.partial(setBoardTypeAt, board, type.gold));

  // can probably one line this one
  _.each(reqData.snakes, function(snake) {
    var isMe = snake.id === snakeId;
    _.each(snake.coords, function(coord) {
      setBoardTypeAt(board, isMe ? type.me : type.other, coord);
    })
  });

  return board;
}

function printBoard(board) {
  _(board)
    .chunk(board.width)
    .map(stringifyRow)
    .each(function(t) {
      console.log(t);
    });
}

function stringifyRow(row) {
  return _(row)
    .map(boardItemRep)
    .value()
    .join('');
}

function boardItemRep(v) {
  return v || 'x';
}

function findMySnake(reqData) {
  return _(reqData.snakes).find({id: snakeId});
}

function boardOffset(board, x, y) {
  return board.width * y + x;
}

function boardValue(board, p) {
  return board[boardOffset(board, p[0], p[1])];
}

function isInRange(lower, upper, value) {
  return lower <= value && value <= upper;
}

function isTraversableAt(board, p) {
  var value = board[boardOffset(board, p[0], p[1])];
  return _.isUndefined(value) || value === type.food || value === type.gold;
}

function isValidAt(board, p) {
  return isInRange(0, board.width - 1, p[0]) && isInRange(0, board.height - 1, p[1]);
}

function setBoardTypeAt(board, type, p) {
  board[boardOffset(board, p[0], p[1])] = type;
  return board;
}

var isTypeAt = _.curry(function(type, board, p) {
  return boardValue(board, p) === type
});

var isMeAt = isTypeAt(type.me),
  isWallAt = isTypeAt(type.wall),
  isFoodAt = isTypeAt(type.food),
  isGoldAt = isTypeAt(type.gold);

var pointDistance = _.curry(function(p1, p2) {
  return Math.abs(p1[0] - p2[0]) + Math.abs(p1[1] - p2[1])
});

function addPoints(p1, p2) {
  return [p1[0] + p2[0], p1[1] + p2[1]];
}

function subtractPoints(p1, p2) {
  return [p1[0] - p2[0], p1[1] - p2[1]];
}

function findValidMoves(board, p) {
  return _(offsets)
    .map(_.partial(addPoints, p))
    .filter(_.partial(isTraversableAt, board))
    .filter(_.partial(isValidAt, board))
    .value();
}

function findPossibleMoves(board, p) {
  return _(offsets)
    .map(_.partial(addPoints, p))
    .filter(_.negate(_.partial(isMeAt, board)))
    .value();
}

function scoreMove (board, move) {

}

function findPathToFood(board, position, route) {
  var validMoves = findValidMoves(board, position);

  //console.log('visiting: ', position, ' validMoves: ', validMoves)

  //console.log('here',t);
  _.each(validMoves, function(move) {
    setBoardTypeAt(board, type.searched, position);
    findPathToFood(board, move);
  });
}

function isAbove(dx, dy) { return dx === 0 && dy === -1; }
function isLeftOf(dx, dy) { return dx === -1 && dy === 0; }
function isBelow(dx, dy) { return dx === 0 && dy === 1; }
function isRightOf(dx, dy) { return dx === 1 && dy === 0; }

function moveDirection(head, target) {
  var dp = subtractPoints(head, target),
    dx = dp[0],
    dy = dp[1],
    direction;

  // can this be done with a find?
  if (isAbove(dx, dy)) {
    direction = 'south';
  } else if (isLeftOf(dx, dy)) {
    direction = 'east'
  } else if (isRightOf(dx, dy)) {
    direction = 'west'
  } else if (isBelow(dx, dy)) {
    direction = 'north'
  }

  return direction;
}

function scorePosition() {

}

// WARNING: destroys board
function accessibleItems(board, head) {

  function emptyPData() {
    return {
      food: [],
      walls: [],
      gold: [],
      empty: [],
      move: head
    };
  }

  function updatePData(board, pData, p) {
    var value = boardValue(board, p);

    if (value === type.food) pData.food.push(p);
    else if (value === type.wall) pData.walls.push(p);
    else if (value === type.gold) pData.gold.push(p);
    else if (_.isUndefined(value)) pData.empty.push(p);

    return pData;
  }

  function crawlTree(board, pData, position) {


    var possibleMoves = findPossibleMoves(board, position);

    _(possibleMoves)
      .filter(_.partial(isWallAt, board))
      .each(function(p) {
        updatePData(board, pData, p);
        setBoardTypeAt(board, type.searched, p);
      });


    var validMoves = findValidMoves(board, position);
    // calculate stats on location
    _.each(validMoves, _.partial(updatePData, board, pData));

    // mark location as searched
    _.each(validMoves, _.partial(setBoardTypeAt, board, type.searched));

    // recurse for any unvisited visitable neighbors
    _.each(validMoves, _.partial(crawlTree, board, pData));
  }

  var stats = emptyPData();
  crawlTree(board, stats, head);
  //console.log(stats);



  return stats;
}

function distanceToClosestFood(stats) {
  return _(stats.food)
    .map(pointDistance(stats.move))
    .min();
}

function distanceToClosestGold(stats) {
  return _(stats.gold)
      .map(pointDistance(stats.move))
      .min();
}

function numberEmptySpaces(stats) {
  return stats.empty.length;
}

var moveStats = _.curry(function(reqBody, move) {

  var board = generateBoard(reqBody);

  var isFood = isFoodAt(board, move),
    isGold = isGoldAt(board, move);

  // make move on board
  setBoardTypeAt(board, type.searched, move);

  //if traversable item (food, gold) then it was overriden above and needs to be included in the stats
  var stats = accessibleItems(board, move);

  if  (isFood) stats.food.push(move);
  else if (isGold) stats.gold.push(move);

  return stats;
});


// Get the state of the snake
router.get(config.routes.state, function (req, res) {
  // Do something here to calculate the returned state

  // Response data
  var data = {
    name: config.snake.name,
    color: config.snake.color,
    head: config.snake.head_url,
    taunt: config.snake.taunt.state,
    state: "alive",
    coords: [[0, 0], [0, 1], [0, 2], [1, 2]],
    score: 4
  };

  return res.json(data);
});

// Start
router.post(config.routes.start, function (req, res) {
  // Do something here to start the game
  // Hint: do something with the incoming game_id? ;)
  //console.log('req.body:', req.body);


  // Response data
  var data = {
    name: config.snake.name,
    color: config.snake.color,
    head_url: config.snake.head_url,
    taunt: config.snake.taunt.start
  };

  return res.json(data);
});

// Move
router.post(config.routes.move, function (req, res) {
  // Do something here to generate your move
  try {
    //console.log('req.body:', req.body);

    var //board = generateBoard(req.body),
      snake = findMySnake(req.body),
      head = _.head(snake.coords),
      hungry = snake.health < 70;

    var validMoves = findValidMoves(generateBoard(req.body), head);
    var board = generateBoard(req.body);


    var makeMove = _.sample(validMoves);

    if (req.body.mode === 'classic') {
      var stat = _(validMoves)
        .map(moveStats(req.body))
        .minBy(distanceToClosestFood);
      if (stat) makeMove = stat.move;
    } else {

      if (hungry) {
        var stat = _(validMoves)
          .map(moveStats(req.body))
          .minBy(distanceToClosestFood);
        if (stat) makeMove = stat.move;
      } else if (req.body.gold.length > 0) {
        var stat = _(validMoves)
          .map(moveStats(req.body))
          .minBy(distanceToClosestGold);
        if (stat) makeMove = stat.move;
      } else {
        var stat = _(validMoves)
          .map(moveStats(req.body))
          .maxBy(numberEmptySpaces);
        if (stat) makeMove = stat.move;
      }

    }


    //console.log(stat);
    //printBoard(board);





    console.log();
    console.log('health: ' + snake.health);
    console.log();



    var t = 'north';

    if (makeMove) t = moveDirection(head, makeMove);

    // Response data
    var data = {
      move: t, // one of: ["north", "south", "west", "east"]
      taunt: 'What?!' || config.snake.taunt.move
    };

    return res.json(data);
  }
  catch(e) {
    console.log(e.stack);
  }
});

// End the session
router.post(config.routes.end, function (req, res) {
  // Do something here to end your snake's session

  // We don't need a response so just send back a 200
  res.status(200);
  res.end();
  return;
});


module.exports = router;
