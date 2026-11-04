# Ruff, pinned to the same version core's justfile pins, so a file formatted
# here and a file formatted there come out identical.
RUFF = uvx ruff@0.15.20

lint:
	$(RUFF) check .
	$(RUFF) format --check .

format:
	$(RUFF) check --fix .
	$(RUFF) format .

# Runs inside the core dev stack, where Django and the database live, through
# core's `just test`; needs `just` on the host and this repo checked out under
# core's dev-plugins/.
test:
	cd ../.. && just test georiva_forecast_viewer
