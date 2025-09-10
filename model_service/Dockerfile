FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

# Python + pip
RUN apt-get update && apt-get install -y python3 python3-pip
RUN ln -s /usr/bin/python3 /usr/bin/python

WORKDIR /app

COPY requirements.txt .

# upgrade pip
RUN pip3 install --upgrade pip

# Instalacja narzędzi systemowych
RUN apt-get update && apt-get install -y git libgl1 libglib2.0-0

# Zainstaluj KOMPAKTYBILNE wersje torch i torchvision
# Te wersje zawierają moduł 'functional_tensor', którego oczekuje basicsr
RUN pip3 install torch==2.0.1 torchvision==0.15.2 --index-url https://download.pytorch.org/whl/cu118

# Stwórz KOPIĘ requirements.txt, ale BEZ linii zawierających torch/torchvision/torchaudio
# To zapobiegnie ich ponownej instalacji i nadpisaniu kompatybilnych wersji
RUN grep -vE "torch|torchvision|torchaudio" requirements.txt > requirements_filtered.txt

# Zainstaluj WSZYSTKIE POZOSTAŁE pakiety z przefiltrowanego pliku
RUN pip3 install -r requirements_filtered.txt --extra-index-url https://download.pytorch.org/whl/cu118

RUN sed -i "s/from torchvision\.transforms\.functional_tensor import rgb_to_grayscale/try:\n    from torchvision.transforms.functional_tensor import rgb_to_grayscale\nexcept ImportError:\n    from torchvision.transforms.functional import rgb_to_grayscale/" /usr/local/lib/python3.10/dist-packages/basicsr/data/degradations.py

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
EXPOSE 8001