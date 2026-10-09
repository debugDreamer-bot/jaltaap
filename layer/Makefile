# SAM "makefile" build for DepsLayer. Downloads Linux x86_64 wheels for Python 3.12, so the layer
# is correct even when building on macOS without Docker. botocore and friends are removed
# afterwards because the Lambda Python runtime already ships them (keeps us far under 250 MB
# together with the Strands layer).
build-DepsLayer:
	python3 -m pip install -r requirements.txt \
		--target "$(ARTIFACTS_DIR)/python" \
		--platform manylinux2014_x86_64 --implementation cp --python-version 3.12 \
		--only-binary=:all: --upgrade --quiet
	cd "$(ARTIFACTS_DIR)/python" && rm -rf botocore botocore-* jmespath jmespath-* dateutil python_dateutil-* \
		six.py six-* urllib3 urllib3-* bin __pycache__
