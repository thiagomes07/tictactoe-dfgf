package game

import (
	"errors"
	"math"
	"math/rand"
	"time"

	"github.com/thiagogomes/tictactoe-dfgf/backend/internal/model"
)

var winningLines = [][3]int{
	{0, 1, 2},
	{3, 4, 5},
	{6, 7, 8},
	{0, 3, 6},
	{1, 4, 7},
	{2, 5, 8},
	{0, 4, 8},
	{2, 4, 6},
}

var errInvalidCell = errors.New("invalid cell index")
var errCellOccupied = errors.New("cell already occupied")

func MakeEmptyBoard() []*model.PlayerSide {
	return make([]*model.PlayerSide, 9)
}

func CloneBoard(board []*model.PlayerSide) []*model.PlayerSide {
	dup := make([]*model.PlayerSide, len(board))
	copy(dup, board)
	return dup
}

func AvailableMoves(board []*model.PlayerSide) []int {
	moves := make([]int, 0, 9)
	for i := range board {
		if board[i] == nil {
			moves = append(moves, i)
		}
	}
	return moves
}

func ApplyMove(board []*model.PlayerSide, side model.PlayerSide, cellIndex int) ([]*model.PlayerSide, error) {
	if cellIndex < 0 || cellIndex >= len(board) {
		return nil, errInvalidCell
	}
	if board[cellIndex] != nil {
		return nil, errCellOccupied
	}

	next := CloneBoard(board)
	s := side
	next[cellIndex] = &s
	return next, nil
}

func Resolve(board []*model.PlayerSide) (winner *model.PlayerSide, winningLine []int, draw bool) {
	for _, line := range winningLines {
		a, b, c := line[0], line[1], line[2]
		if board[a] != nil && board[b] != nil && board[c] != nil {
			if *board[a] == *board[b] && *board[b] == *board[c] {
				w := *board[a]
				return &w, []int{a, b, c}, false
			}
		}
	}

	for _, cell := range board {
		if cell == nil {
			return nil, nil, false
		}
	}

	return nil, nil, true
}

func OtherSide(side model.PlayerSide) model.PlayerSide {
	if side == model.PlayerSideX {
		return model.PlayerSideO
	}
	return model.PlayerSideX
}

func ChooseMove(board []*model.PlayerSide, aiSide model.PlayerSide, difficulty model.AiDifficulty) int {
	moves := AvailableMoves(board)
	if len(moves) == 0 {
		return -1
	}

	if difficulty == model.AiDifficultyPreAlmoco {
		rng := rand.New(rand.NewSource(time.Now().UnixNano()))
		return moves[rng.Intn(len(moves))]
	}

	bestScore := math.Inf(-1)
	bestMove := -1
	for _, move := range moves {
		next, _ := ApplyMove(board, aiSide, move)
		score := minimax(next, aiSide, OtherSide(aiSide))
		if score > bestScore {
			bestScore = score
			bestMove = move
		}
	}

	if bestMove >= 0 {
		return bestMove
	}

	return moves[0]
}

func minimax(board []*model.PlayerSide, aiSide model.PlayerSide, current model.PlayerSide) float64 {
	winner, _, draw := Resolve(board)
	if winner != nil {
		if *winner == aiSide {
			return 10
		}
		return -10
	}
	if draw {
		return 0
	}

	moves := AvailableMoves(board)
	if current == aiSide {
		best := math.Inf(-1)
		for _, move := range moves {
			next, _ := ApplyMove(board, current, move)
			score := minimax(next, aiSide, OtherSide(current))
			if score > best {
				best = score
			}
		}
		return best
	}

	best := math.Inf(1)
	for _, move := range moves {
		next, _ := ApplyMove(board, current, move)
		score := minimax(next, aiSide, OtherSide(current))
		if score < best {
			best = score
		}
	}
	return best
}
