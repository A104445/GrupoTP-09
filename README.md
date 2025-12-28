### Foi mudado tipo máquina para:

e2-standard-2 e zona: us-west1-b

## ENV
Usar .vault_pass com ascn2526
## Dependências

ansible [core 2.16.3]
  config file = /home/vagrant/ProjetoASCN/codebase/ansible.cfg
  configured module search path = ['/home/vagrant/.ansible/plugins/modules', '/usr/share/ansible/plugins/modules']
  ansible python module location = /usr/lib/python3/dist-packages/ansible
  ansible collection location = /home/vagrant/.ansible/collections:/usr/share/ansible/collections
  executable location = /usr/bin/ansible
  python version = 3.12.3 (main, Aug 14 2025, 17:47:21) [GCC 13.3.0] (/usr/bin/python3)
  jinja version = 3.1.2
  libyaml = True

## Kubectl

Client Version: v1.33.5-dispatcher
Kustomize Version: v5.6.0

## K6

### Instalação

### Ubuntu/Debian
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

## Configure o GCloud também

Com gcloud init ou com auth..

## ENCERRAR GKE COM ANSIBLE-PLAYBOOK GKE-CLUSTER-UNDEPLOY.YML SEMPRE NAO DEIXAR MAQUINAS LIGADAS

# Utilização

Ir na raiz do diretório e executar o ansible-playbook gke-cluster-deploy.yml

### Se GKE já estiver a correr utilizar o seguinte comando para kubectl ficar com as credentials:

gcloud container clusters get-credentials  --project=projetoascn2025  --zone=us-west1-b ascn-cluster

### Duas opções fazer o test-all / checkpoint.sh ( tem de saber usar..está nas discussoes da UC no GitHub)

ansible-playbook test-all.yml

### No caso de querer apenas airtrail ligado para fazer stress tests / monitorização etc.. fazer:

ansible-playbook airtrail-deploy.yml

### Para ativar monitorizacao

ansible-playbook monitoring-deploy.yml

### Vai depois de configurado aparecer dois urls. 1-Grafana; 2-Prometheus
USER:admin

PASSWORD:admin

Entrar no primeiro link ( Grafana) ir em Connections > DataSources e adicionar o Prometheus. Nome com P em maisculas (Prometheus).

Colocar o url do Prometheus.

Depois em DashBoard adicionar o json que está no projeto.

## Para dar deploy ou undeploy de alguma seja monitoring/airtrail
ansible-playbook (qualquercoisa).yml

## Para correr os stress tests (teste é genérico)
### Nao esquecer de mudar IP para usar o da app_ip do gcp
```bash
k6 run tests/k6/teste.js
```
### Teste pode ser feito na k6 na cloud é preciso criar conta Grafana!!

Entrar na conta, na stack. deve algum do genero username.grafana.net

Ir em performance > Default project > Create new test > Na maquina que tem o k6 fazer comando do authenticate > na maquinae em questão: k6 cloud run stress-test.js (atencao com cd para conseguir executar ou não..)
### Output results to JSON file
k6 run --out json=results.json tests/k6/teste.js


